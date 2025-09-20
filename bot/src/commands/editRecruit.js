const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
  EmbedBuilder
} = require('discord.js');

// gameRecruitから募集データをインポート
const gameRecruit = require('./gameRecruit');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('editrecruit')
    .setDescription('募集内容を編集します')
    .addStringOption(option =>
      option.setName('募集id')
        .setDescription('編集したい募集のID（募集IDの下8桁）')
        .setRequired(true)
        .setMaxLength(8)
    ),

  async execute(interaction) {
    try {
      const recruitId = interaction.options.getString('募集id');
      
      // 募集IDから実際のメッセージIDを見つける
      const messageId = await findMessageIdByRecruitId(interaction, recruitId);
      
      if (!messageId) {
        await interaction.reply({
          content: `❌ 募集ID \`${recruitId}\` に対応する募集が見つかりませんでした。`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // 募集データを取得
      const recruitData = gameRecruit.getRecruitData(messageId);
      
      if (!recruitData) {
        await interaction.reply({
          content: `❌ 募集ID \`${recruitId}\` の募集データが見つかりませんでした。募集が既に締め切られているか、無効なIDです。`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // 募集主の権限チェック
      if (recruitData.recruiterId !== interaction.user.id) {
        await interaction.reply({
          content: `❌ この募集の編集権限がありません。募集は募集主のみが編集できます。`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // 編集用モーダルを表示
      await showEditModal(interaction, recruitData, messageId);

    } catch (error) {
      console.error('editRecruit execute error:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'エラーが発生しました。',
          flags: MessageFlags.Ephemeral
        });
      }
    }
  },

  // モーダル送信後の処理
  async handleEditModalSubmit(interaction) {
    if (!interaction.customId.startsWith('editRecruitModal_')) return;
    
    try {
      // メッセージIDをカスタムIDから取得
      const messageId = interaction.customId.replace('editRecruitModal_', '');
      
      // 人数の入力値を検証
      const participantsInput = interaction.fields.getTextInputValue('participants');
      const participantsNum = parseInt(participantsInput);
      
      if (isNaN(participantsNum) || participantsNum < 1 || participantsNum > 16) {
        await interaction.reply({
          content: '❌ 参加人数は1〜16の数字で入力してください。',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // 新しい募集データを取得
      const newRecruitData = {
        title: interaction.fields.getTextInputValue('title'),
        content: interaction.fields.getTextInputValue('content'),
        participants: participantsNum,
        startTime: interaction.fields.getTextInputValue('startTime'),
        vc: interaction.fields.getTextInputValue('vc'),
        recruiterId: interaction.user.id
      };

      // 募集データを更新
      gameRecruit.updateRecruitData(messageId, newRecruitData);

      // 募集メッセージを更新
      await updateRecruitMessage(interaction, messageId, newRecruitData);

      // 成功メッセージ
      const successEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ 募集編集完了')
        .setDescription('募集内容を正常に更新しました。')
        .addFields(
          { name: 'タイトル', value: newRecruitData.title, inline: false },
          { name: '参加人数', value: `${newRecruitData.participants}人`, inline: true },
          { name: '開始時間', value: newRecruitData.startTime, inline: true },
          { name: 'VC', value: newRecruitData.vc, inline: true }
        )
        .setTimestamp();

      await interaction.reply({
        embeds: [successEmbed],
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      console.error('editRecruit handleModalSubmit error:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'エラーが発生しました。',
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};

// 募集IDから実際のメッセージIDを見つける関数
async function findMessageIdByRecruitId(interaction, recruitId) {
  // 現在のチャンネルで最近のメッセージを検索
  try {
    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    
    for (const [messageId, message] of messages) {
      // メッセージIDの下8桁が募集IDと一致するかチェック
      if (messageId.slice(-8) === recruitId) {
        // botのメッセージで募集パネルかどうかチェック
        if (message.author.id === interaction.client.user.id && 
            message.components && message.components.length > 0) {
          return messageId;
        }
      }
    }
    return null;
  } catch (error) {
    console.error('findMessageIdByRecruitId error:', error);
    return null;
  }
}

// 編集用モーダルを表示する関数
async function showEditModal(interaction, recruitData, messageId) {
  const modal = new ModalBuilder()
    .setCustomId(`editRecruitModal_${messageId}`)
    .setTitle('📝 募集内容編集');

  const titleInput = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('タイトル')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(recruitData.title || ''); // 既存値を設定

  const contentInput = new TextInputBuilder()
    .setCustomId('content')
    .setLabel('募集内容')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setValue(recruitData.content || ''); // 既存値を設定

  const participantsInput = new TextInputBuilder()
    .setCustomId('participants')
    .setLabel('参加人数（1-16）')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(2)
    .setValue(String(recruitData.participants || '')); // 既存値を設定

  const timeInput = new TextInputBuilder()
    .setCustomId('startTime')
    .setLabel('開始時間（例: 21:00）')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(recruitData.startTime || ''); // 既存値を設定

  const vcInput = new TextInputBuilder()
    .setCustomId('vc')
    .setLabel('VCの有無（あり / なし）')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(recruitData.vc || ''); // 既存値を設定

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(contentInput),
    new ActionRowBuilder().addComponents(participantsInput),
    new ActionRowBuilder().addComponents(timeInput),
    new ActionRowBuilder().addComponents(vcInput)
  );

  await interaction.showModal(modal);
}

// 募集メッセージを更新する関数
async function updateRecruitMessage(interaction, messageId, newRecruitData) {
  try {
    // 元のメッセージを取得
    const message = await interaction.channel.messages.fetch(messageId);
    
    // 新しい画像を生成
    const { generateRecruitCard } = require('../utils/canvasRecruit');
    const participants = gameRecruit.getParticipants(messageId) || [];
    const buffer = await generateRecruitCard(newRecruitData, participants, interaction.client);
    
    // 新しい画像でメッセージを更新
    const { 
      AttachmentBuilder, 
      ContainerBuilder, 
      TextDisplayBuilder,
      SeparatorBuilder, 
      SeparatorSpacingSize,
      ButtonBuilder, 
      ButtonStyle,
      ActionRowBuilder,
      MediaGalleryBuilder,
      MediaGalleryItemBuilder,
      MessageFlags
    } = require('discord.js');
    
    const image = new AttachmentBuilder(buffer, { name: 'recruit-card.png' });
    const user = interaction.user;
    
    // 参加者リスト表示を再構築
    let participantText = `🎯✨ 参加リスト ✨🎯\n`;
    if (participants.length > 0) {
      participantText += participants.map(userId => `🎮 <@${userId}>`).join('\n');
    }

    const container = new ContainerBuilder();
    container.setAccentColor(0xFF69B4);

    // ユーザー名表示
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`🎮✨ **${user.username}さんの募集** ✨🎮`)
    );

    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://recruit-card.png')
      )
    )
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(participantText)
    )

    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("join")
          .setLabel("参加")
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("cancel")
          .setLabel("取り消し")
          .setEmoji('✖️')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("close")
          .setLabel("締め")
          .setStyle(ButtonStyle.Secondary)
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`募集ID：\`${messageId.slice(-8)}\` | powered by **rectbot**`)
    );

    // メッセージを更新
    await message.edit({
      files: [image],
      components: [container],
      flags: MessageFlags.IsComponentsV2
    });

    // DB上の募集データも更新
    const { updateRecruitmentData } = require('../utils/db');
    await updateRecruitmentData(messageId, newRecruitData);

  } catch (error) {
    console.error('updateRecruitMessage error:', error);
    throw error;
  }
}