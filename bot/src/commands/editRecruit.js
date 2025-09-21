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
      console.log(`[editRecruit] 編集要求: recruitId=${recruitId}, user=${interaction.user.id}`);
      
      // デバッグ: 現在のメモリ上の募集データを確認
      const allRecruitData = gameRecruit.getAllRecruitData ? gameRecruit.getAllRecruitData() : 'getAllRecruitData method not available';
      console.log(`[editRecruit] 現在のメモリ上の募集データ:`, allRecruitData);
      
      // 募集IDから実際のメッセージIDを見つける
      const messageId = await findMessageIdByRecruitId(interaction, recruitId);
      
      if (!messageId) {
        // メッセージが見つからない場合、メモリ上のデータから直接検索を試行
        console.log(`[editRecruit] メッセージ検索失敗、メモリから直接検索を試行`);
        const allRecruitData = gameRecruit.getAllRecruitData();
        
        let foundMessageId = null;
        for (const [msgId, data] of Object.entries(allRecruitData)) {
          if (data.recruitId === recruitId) {
            foundMessageId = msgId;
            console.log(`[editRecruit] メモリから発見: messageId=${msgId}, recruitId=${data.recruitId}`);
            break;
          }
        }
        
        if (foundMessageId) {
          // メモリから見つかった場合、そのIDを使用
          const recruitData = gameRecruit.getRecruitData(foundMessageId);
          if (recruitData && recruitData.recruiterId === interaction.user.id) {
            await showEditModal(interaction, recruitData, foundMessageId);
            return;
          } else if (recruitData && recruitData.recruiterId !== interaction.user.id) {
            await interaction.reply({
              content: `❌ この募集の編集権限がありません。募集は募集主のみが編集できます。`,
              flags: MessageFlags.Ephemeral
            });
            return;
          }
        }
        
        await interaction.reply({
          content: `❌ 募集ID \`${recruitId}\` に対応する募集が見つかりませんでした。\n\n**利用可能な募集一覧:**\n${Object.entries(allRecruitData).length > 0 ? Object.entries(allRecruitData).map(([msgId, data]) => `• ID: \`${data.recruitId}\` - ${data.title || '無題'} (作成者: <@${data.recruiterId}>)`).join('\n') : '現在アクティブな募集はありません'}\n\n**トラブルシューティング:**\n• 募集IDは8桁の数字です（例: \`12345678\`）\n• 募集が既に締め切られていないか確認してください\n• 他のチャンネルの募集ではないか確認してください`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // 募集データを取得
      const recruitData = gameRecruit.getRecruitData(messageId);
      
      if (!recruitData) {
        // メッセージは見つかったがメモリにデータがない場合の対処
        console.log(`[editRecruit] メッセージは存在するがメモリにデータなし: messageId=${messageId}`);
        
        // チャンネルから実際のメッセージを取得してデータを復元を試行
        try {
          const message = await interaction.channel.messages.fetch(messageId);
          if (message && message.components && message.components.length > 0) {
            await interaction.reply({
              content: `❌ 募集ID \`${recruitId}\` の募集データがメモリから失われています。\n\nこれはボットが再起動されたか、一時的な問題が発生した可能性があります。\n\n**対処方法:**\n• ボット管理者に連絡してください\n• または新しい募集を作成し直してください`,
              flags: MessageFlags.Ephemeral
            });
            return;
          }
        } catch (fetchError) {
          console.error(`[editRecruit] メッセージ取得エラー:`, fetchError);
        }
        
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
    console.log(`[findMessageIdByRecruitId] 検索開始: recruitId=${recruitId}`);
    
    // まずメモリから直接検索
    const allRecruitData = gameRecruit.getAllRecruitData();
    console.log(`[findMessageIdByRecruitId] メモリ上の募集データ数: ${Object.keys(allRecruitData).length}`);
    
    for (const [messageId, data] of Object.entries(allRecruitData)) {
      console.log(`[findMessageIdByRecruitId] メモリ検索: messageId=${messageId}, data.recruitId=${data.recruitId}, 検索ID=${recruitId}`);
      if (data.recruitId === recruitId || data.recruitId === String(recruitId)) {
        console.log(`[findMessageIdByRecruitId] メモリから発見: messageId=${messageId}`);
        return messageId;
      }
    }
    
    // メモリになければメッセージを検索
    console.log(`[findMessageIdByRecruitId] メモリに見つからず、メッセージ検索を開始`);
    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    console.log(`[findMessageIdByRecruitId] 取得したメッセージ数: ${messages.size}`);
    
    const botMessages = [];
    
    for (const [messageId, message] of messages) {
      // botのメッセージのみチェック
      if (message.author.id === interaction.client.user.id) {
        const messageRecruitId = String(messageId).slice(-8);
        console.log(`[findMessageIdByRecruitId] Bot message found: messageId=${messageId}, recruitId=${messageRecruitId}, hasComponents=${message.components && message.components.length > 0}`);
        
        botMessages.push({
          messageId,
          recruitId: messageRecruitId,
          hasComponents: message.components && message.components.length > 0,
          content: message.content ? message.content.substring(0, 50) + '...' : 'No content'
        });
        
        // メッセージIDの下8桁が募集IDと一致するかチェック（文字列として比較）
        if (messageRecruitId === String(recruitId)) {
          // botのメッセージで募集パネルかどうかチェック
          if (message.components && message.components.length > 0) {
            console.log(`[findMessageIdByRecruitId] 一致する募集を発見: messageId=${messageId}`);
            
            // メモリにデータがない場合でも、メッセージが存在すればそれを返す
            const hasMemoryData = gameRecruit.getRecruitData(messageId);
            if (!hasMemoryData) {
              console.log(`[findMessageIdByRecruitId] 警告: メッセージは存在するがメモリにデータなし`);
            }
            return messageId;
          } else {
            console.log(`[findMessageIdByRecruitId] IDは一致するがコンポーネントなし: messageId=${messageId}`);
          }
        }
      }
    }
    
    console.log(`[findMessageIdByRecruitId] 全てのbotメッセージ:`, botMessages);
    console.log(`[findMessageIdByRecruitId] 募集ID ${recruitId} に一致するメッセージが見つかりませんでした`);
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