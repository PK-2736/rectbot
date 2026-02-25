const { PermissionsBitField, EmbedBuilder, MessageFlags } = require('discord.js');
const { safeReply } = require('../../../utils/safeReply');
const { getGuildSettings, getRecruitFromRedis, getParticipantsFromRedis } = require('../utils/database');

async function validateDedicatedChannelFeature(interaction, guildSettings) {
  if (!guildSettings?.enable_dedicated_channel) {
    await safeReply(interaction, {
      content: '⚠️ 専用チャンネル作成は現在オフになっています。設定画面からオンにしてください。',
      flags: MessageFlags.Ephemeral,
      allowedMentions: { roles: [], users: [] }
    });
    return false;
  }
  return true;
}

async function checkExistingDedicatedChannel(interaction, recruitId) {
  const { getDedicatedChannel } = require('../../../utils/db/dedicatedChannels');
  const existingChannelId = await getDedicatedChannel(recruitId).catch(() => null);

  if (existingChannelId) {
    const existingChannel = await interaction.guild.channels.fetch(existingChannelId).catch(() => null);
    if (existingChannel) {
      await safeReply(interaction, {
        content: `✨ 専用チャンネルは既に作成されています: <#${existingChannelId}>`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { roles: [], users: [] }
      });
      return true;
    }
  }
  return false;
}

function extractMessageId(recruit) {
  return recruit?.message_id || recruit?.messageId;
}

async function tryGetPersistedParticipants(messageId) {
  if (!messageId) return null;
  
  try {
    const persisted = await getParticipantsFromRedis(messageId);
    return Array.isArray(persisted) ? persisted : null;
  } catch (e) {
    console.warn('Failed to get participants from Redis:', e?.message || e);
    return null;
  }
}

function getCurrentMembersFromRecruit(recruit) {
  if (recruit?.currentMembers && Array.isArray(recruit.currentMembers)) {
    return recruit.currentMembers;
  }
  return null;
}

async function extractParticipants(recruit) {
  const messageId = extractMessageId(recruit);
  
  const persisted = await tryGetPersistedParticipants(messageId);
  if (persisted) return persisted;
  
  const currentMembers = getCurrentMembersFromRecruit(recruit);
  if (currentMembers) return currentMembers;
  
  return [];
}

async function loadRecruitmentParticipants(recruitId) {
  const recruit = await getRecruitFromRedis(recruitId).catch(() => null);
  const participants = await extractParticipants(recruit);
  return { participants, recruit };
}

async function validateUserIsParticipant(interaction, participants) {
  if (!participants.includes(interaction.user.id)) {
    await safeReply(interaction, {
      content: '❌ この募集の参加者のみが専用チャンネルを作成できます。',
      flags: MessageFlags.Ephemeral,
      allowedMentions: { roles: [], users: [] }
    });
    return false;
  }

  if (participants.length === 0) {
    await safeReply(interaction, {
      content: '❌ 参加者がいないため、チャンネルを作成できません。',
      flags: MessageFlags.Ephemeral,
      allowedMentions: { roles: [], users: [] }
    });
    return false;
  }

  return true;
}

async function validateBotPermissions(interaction) {
  const me = interaction.guild.members.me || await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
  const missingPerms = [];

  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
    missingPerms.push('チャンネル管理');
  }

  if (missingPerms.length > 0) {
    await safeReply(interaction, {
      content: `❌ 専用チャンネルを作成できませんでした。BOTに次の権限を付与してください: ${missingPerms.join(', ')}`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { roles: [], users: [] }
    });
    return false;
  }

  return true;
}

function buildDedicatedChannelPermissions(interaction, participants) {
  return [
    {
      id: interaction.guild.id,
      deny: [PermissionsBitField.Flags.ViewChannel]
    },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.EmbedLinks
      ]
    },
    ...participants.map(userId => ({
      id: userId,
      allow: [PermissionsBitField.Flags.ViewChannel]
    }))
  ];
}

async function sendDedicatedChannelWelcome(channel, recruit, participants) {
  try {
    const welcomeEmbed = new EmbedBuilder()
      .setTitle('🎮 専用チャンネルへようこそ')
      .setDescription(`**${recruit?.title || '募集'}** の専用チャンネルです。`)
      .setColor('#5865F2')
      .addFields(
        { name: '参加者', value: participants.map(id => `<@${id}>`).join(', ') || 'なし', inline: false }
      )
      .setFooter({ text: 'Recrubo' })
      .setTimestamp();

    await channel.send({ embeds: [welcomeEmbed] });
  } catch (error) {
    console.warn('[processCreateDedicatedChannel] welcome message failed:', error);
  }
}

async function prepareDedicatedChannelContext(interaction, recruitId) {
  const guildSettings = await getGuildSettings(interaction.guildId).catch(() => ({}));
  if (!(await validateDedicatedChannelFeature(interaction, guildSettings))) return null;

  if (await checkExistingDedicatedChannel(interaction, recruitId)) return null;

  const { participants, recruit } = await loadRecruitmentParticipants(recruitId);

  if (!(await validateUserIsParticipant(interaction, participants))) return null;
  if (!(await validateBotPermissions(interaction))) return null;

  return { guildSettings, participants, recruit };
}

function buildChannelName(recruit, recruitId) {
  return recruit?.title ? `${recruit.title}`.slice(0, 100) : `recruit-${recruitId}`;
}

async function createDedicatedChannel(interaction, { guildSettings, participants, recruit }, recruitId) {
  const channelName = buildChannelName(recruit, recruitId);
  const permissionOverwrites = buildDedicatedChannelPermissions(interaction, participants);

  return interaction.guild.channels.create({
    name: channelName,
    type: 0,
    permissionOverwrites,
    topic: `🎮 ${recruit?.title || '募集'} の専用チャンネル`,
    parent: guildSettings?.dedicated_channel_category_id || undefined,
  });
}

async function persistDedicatedChannel(recruitId, channelId) {
  try {
    const { saveDedicatedChannel } = require('../../../utils/db/dedicatedChannels');
    await saveDedicatedChannel(recruitId, channelId, 86400);
  } catch (error) {
    console.warn('[processCreateDedicatedChannel] saveDedicatedChannel failed:', error);
  }
}

async function processCreateDedicatedChannel(interaction, recruitId) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const context = await prepareDedicatedChannelContext(interaction, recruitId);
    if (!context) return;

    try {
      const dedicatedChannel = await createDedicatedChannel(interaction, context, recruitId);
      console.log('[processCreateDedicatedChannel] Channel created:', dedicatedChannel.id);

      await persistDedicatedChannel(recruitId, dedicatedChannel.id);
      await sendDedicatedChannelWelcome(dedicatedChannel, context.recruit, context.participants);

      await safeReply(interaction, {
        content: `✨ 専用チャンネルを作成しました: <#${dedicatedChannel.id}>`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { roles: [], users: [] }
      });
    } catch (error) {
      console.error('[processCreateDedicatedChannel] Channel creation failed:', error);
      await safeReply(interaction, {
        content: `❌ チャンネル作成に失敗しました。\n詳細: ${error?.message || '不明なエラー'}`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { roles: [], users: [] }
      }).catch(() => null);
    }
  } catch (error) {
    console.error('[processCreateDedicatedChannel] Outer error:', error);
    await safeReply(interaction, {
      content: '❌ チャンネル作成に失敗しました。',
      flags: MessageFlags.Ephemeral,
      allowedMentions: { roles: [], users: [] }
    }).catch(() => null);
  }
}

module.exports = {
  processCreateDedicatedChannel
};
