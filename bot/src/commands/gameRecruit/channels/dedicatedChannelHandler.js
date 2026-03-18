const { PermissionsBitField, EmbedBuilder, MessageFlags, ChannelType } = require('discord.js');
const { getGuildSettings, getRecruitFromRedis, getParticipantsFromRedis } = require('../../../utils/database');
const { safeReply } = require('../../../utils/safeReply');

async function processCreateDedicatedChannel(interaction, recruitId) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    // Step 1: 設定と既存チャンネルを確認
    const { guildSettings, existingChannelId } = await validateDedicatedChannelSetup(interaction, recruitId);
    if (!guildSettings) return;
    if (existingChannelId) return;
    
    // Step 2: 募集と参加者を取得
    const recruit = await getRecruitFromRedis(recruitId).catch(() => null);
    const participants = await loadRecruitParticipants(recruitId, recruit, interaction);
    
    // Step 3: ユーザー権限を検証
    if (!(await validateParticipantAccess(interaction, participants))) return;
    if (!(participants.length > 0)) { 
      await safeReply(interaction, { 
        content: '❌ 参加者がいないため、チャンネルを作成できません。', 
        flags: MessageFlags.Ephemeral, 
        allowedMentions: { roles: [], users: [] } 
      }); 
      return; 
    }
    
    // Step 4: ボット権限を検証
    if (!(await validateBotPermissions(interaction))) return;
    
    // Step 5: チャンネルを作成
    const dedicatedChannel = await createAndSetupDedicatedChannel(interaction, recruitId, recruit, participants, guildSettings);
    if (!dedicatedChannel) return;
    
    // Step 6: ウェルカムメッセージを送信
    await sendWelcomeMessage(dedicatedChannel, recruit, participants);
    
    await safeReply(interaction, { 
      content: `✨ 専用チャンネルを作成しました: <#${dedicatedChannel.id}>`, 
      flags: MessageFlags.Ephemeral, 
      allowedMentions: { roles: [], users: [] } 
    });
  } catch (error) {
    console.error('[processCreateDedicatedChannel] Outer error:', error);
    await safeReply(interaction, { 
      content: '❌ チャンネル作成に失敗しました。', 
      flags: MessageFlags.Ephemeral, 
      allowedMentions: { roles: [], users: [] } 
    }).catch(() => null);
  }
}

async function validateDedicatedChannelSetup(interaction, recruitId) {
  const guildSettings = await getGuildSettings(interaction.guildId).catch(() => ({}));
  if (!guildSettings?.enable_dedicated_channel) {
    await safeReply(interaction, { 
      content: '⚠️ 専用チャンネル作成は現在オフになっています。設定画面からオンにしてください。', 
      flags: MessageFlags.Ephemeral, 
      allowedMentions: { roles: [], users: [] } 
    });
    return { guildSettings: null, existingChannelId: null };
  }

  const { getDedicatedChannel } = require('../../../utils/database/db/dedicatedChannels');
  const existingChannelId = await getDedicatedChannel(recruitId).catch(() => null);
  if (existingChannelId) {
    const existingChannel = await interaction.guild.channels.fetch(existingChannelId).catch(() => null);
    if (existingChannel) {
      await safeReply(interaction, { 
        content: `✨ 専用チャンネルは既に作成されています: <#${existingChannelId}>`, 
        flags: MessageFlags.Ephemeral, 
        allowedMentions: { roles: [], users: [] } 
      });
      return { guildSettings, existingChannelId: true };
    }
  }
  
  return { guildSettings, existingChannelId: null };
}

async function loadRecruitParticipants(recruitId, recruit, interaction) {
  const messageId = recruit?.message_id || recruit?.messageId || interaction?.message?.id;
  let participants = [];
  
  try {
    if (messageId) {
      const persisted = await getParticipantsFromRedis(messageId);
      if (Array.isArray(persisted)) participants = persisted;
    }
    if (participants.length === 0 && recruit?.currentMembers) {
      participants = Array.isArray(recruit.currentMembers) ? recruit.currentMembers : [];
    }
  } catch (e) {
    console.warn('Failed to get participants:', e?.message || e);
  }
  
  return participants;
}

async function validateParticipantAccess(interaction, participants) {
  if (!participants.includes(interaction.user.id)) {
    await safeReply(interaction, { 
      content: '❌ この募集の参加者のみが専用チャンネルを作成できます。', 
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
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) missingPerms.push('チャンネル管理');
  
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

async function createAndSetupDedicatedChannel(interaction, recruitId, recruit, participants, guildSettings) {
  const { saveDedicatedChannel } = require('../../../utils/database/db/dedicatedChannels');
  const channelName = recruit?.title ? `${recruit.title}`.slice(0, 100) : `recruit-${recruitId}`;

  const dedicatedType = ['voice', 'text', 'thread'].includes(String(guildSettings?.dedicated_channel_type || 'voice'))
    ? String(guildSettings?.dedicated_channel_type || 'voice')
    : 'voice';

  const permissionOverwrites = [
    { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.EmbedLinks,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
      ]
    },
    ...participants.map(userId => ({
      id: userId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
      ]
    }))
  ];
  
  try {
    console.log('[createAndSetupDedicatedChannel] Creating channel:', {
      name: channelName,
      type: dedicatedType,
      botId: interaction.client.user.id,
      participantsCount: participants.length
    });

    const dedicatedChannel = await createDedicatedSpaceByType({
      interaction,
      channelName,
      recruit,
      participants,
      guildSettings,
      dedicatedType,
      permissionOverwrites,
    });

    console.log('[createAndSetupDedicatedChannel] Channel created:', dedicatedChannel.id);
    
    try { 
      await saveDedicatedChannel(recruitId, dedicatedChannel.id, 86400); 
    } catch (error) { 
      console.warn('[createAndSetupDedicatedChannel] saveDedicatedChannel failed:', error); 
    }
    
    return dedicatedChannel;
  } catch (error) {
    console.error('[createAndSetupDedicatedChannel] Channel creation failed:', error);
    await safeReply(interaction, { 
      content: `❌ チャンネル作成に失敗しました。\n詳細: ${error?.message || '不明なエラー'}`, 
      flags: MessageFlags.Ephemeral, 
      allowedMentions: { roles: [], users: [] } 
    }).catch(() => null);
    return null;
  }
}

async function createDedicatedSpaceByType({ interaction, channelName, recruit, participants, guildSettings, dedicatedType, permissionOverwrites }) {
  if (dedicatedType === 'thread') {
    return await createDedicatedThread(interaction, channelName, recruit, participants, guildSettings);
  }

  const channelType = dedicatedType === 'text' ? ChannelType.GuildText : ChannelType.GuildVoice;
  const createPayload = {
    name: channelName,
    type: channelType,
    permissionOverwrites,
    parent: guildSettings?.dedicated_channel_category_id || undefined,
  };

  if (channelType === ChannelType.GuildText) {
    createPayload.topic = `🎮 ${recruit?.title || '募集'} の専用チャンネル`;
  }

  return await interaction.guild.channels.create(createPayload);
}

async function createDedicatedThread(interaction, channelName, recruit, participants, guildSettings) {
  const parentChannelId = guildSettings?.dedicated_thread_parent_channel_id;
  if (!parentChannelId) {
    throw new Error('スレッド作成先チャンネルが未設定です。/setting の機能設定で作成先を指定してください。');
  }

  const parentChannel = await interaction.guild.channels.fetch(parentChannelId).catch(() => null);
  if (!parentChannel || !parentChannel.isTextBased()) {
    throw new Error('スレッド作成先チャンネルが見つからないか、スレッド非対応です。');
  }

  if (parentChannel.type === ChannelType.GuildText) {
    const thread = await parentChannel.threads.create({
      name: channelName,
      autoArchiveDuration: 1440,
      type: ChannelType.PrivateThread,
      invitable: false,
      reason: '募集専用スレッド作成',
    });

    for (const userId of participants) {
      await thread.members.add(userId).catch(() => null);
    }
    return thread;
  }

  if (parentChannel.type === ChannelType.GuildAnnouncement) {
    const starter = await parentChannel.send({
      content: `🎮 **${recruit?.title || '募集'}** の専用スレッドを作成します。`,
      allowedMentions: { roles: [], users: [] }
    });
    const thread = await starter.startThread({
      name: channelName,
      autoArchiveDuration: 1440,
      reason: '募集専用スレッド作成',
    });
    return thread;
  }

  throw new Error('このチャンネル種別にはスレッドを作成できません。テキスト/アナウンスチャンネルを指定してください。');
}

async function sendWelcomeMessage(dedicatedChannel, recruit, participants) {
  try {
    const welcomeEmbed = new EmbedBuilder()
      .setTitle('🎮 専用チャンネルへようこそ')
      .setDescription(`**${recruit?.title || '募集'}** の専用チャンネルです。`)
      .setColor('#5865F2')
      .addFields({ name: '参加者', value: participants.map(id => `<@${id}>`).join(', ') || 'なし', inline: false })
      .setFooter({ text: 'Recrubo' })
      .setTimestamp();
    await dedicatedChannel.send({ embeds: [welcomeEmbed] });
  } catch (error) {
    console.warn('[sendWelcomeMessage] welcome message failed:', error);
  }
}

module.exports = {
  processCreateDedicatedChannel,
  validateDedicatedChannelSetup,
  loadRecruitParticipants,
  validateParticipantAccess,
  validateBotPermissions,
  createAndSetupDedicatedChannel,
  sendWelcomeMessage
};
