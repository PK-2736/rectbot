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
    .setName('rect-edit')
    .setDescription('募集内容を編集します（/rect-edit 募集ID）')
    .addStringOption(option =>
      option.setName('募集id')
        .setDescription('編集したい募集のID（募集パネル下部に表示される8桁の数字）')
        .setRequired(true)
        .setMaxLength(8)
    ),

  async execute(interaction) {
    const recruitId = interaction.options.getString('募集id');
    const allRecruitData = await gameRecruit.getAllRecruitData();
    let found = null;
    let foundMessageId = null;
    for (const [messageId, data] of Object.entries(allRecruitData)) {
      if (data && data.recruitId === recruitId) {
        found = data;
        foundMessageId = messageId;
        break;
      }
    }
    if (!found) {
      await interaction.reply({
        content: `❌ 募集ID \`${recruitId}\` に対応する募集が見つかりませんでした。`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    if (found.recruiterId !== interaction.user.id) {
      await interaction.reply({
        content: `❌ この募集の編集権限がありません。募集は募集主のみが編集できます。`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    await showEditModal(interaction, found, foundMessageId);
  },

  // モーダル送信後の処理
  async handleEditModalSubmit(interaction) {
    if (!interaction.customId.startsWith('editRecruitModal_')) return;
    const message_id = interaction.customId.replace('editRecruitModal_', '');
    const participantsInput = interaction.fields.getTextInputValue('participants');
    const participantsNum = parseInt(participantsInput);
    if (isNaN(participantsNum) || participantsNum < 1 || participantsNum > 16) {
      await interaction.reply({
        content: '❌ 参加人数は1〜16の数字で入力してください。',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    const newRecruitData = {
      title: interaction.fields.getTextInputValue('title'),
      content: interaction.fields.getTextInputValue('content'),
      participants: participantsNum,
      startTime: interaction.fields.getTextInputValue('startTime'),
      vc: interaction.fields.getTextInputValue('vc'),
      recruiterId: interaction.user.id
    };
    await gameRecruit.updateRecruitData(message_id, newRecruitData);
    await updateRecruitMessage(interaction, message_id, newRecruitData);
    await interaction.reply({
      content: `✅ 募集内容を更新しました。`,
      flags: MessageFlags.Ephemeral
    });
  }
};

// 募集IDから実際のメッセージIDを見つける関数
async function findMessageIdByRecruitId(interaction, recruitId) {
  // 現在のチャンネルで最近のメッセージを検索
  try {
    console.log(`[findMessageIdByRecruitId] 検索開始: recruitId=${recruitId}`);
    
    // まずメモリから直接検索
    const allRecruitData = await gameRecruit.getAllRecruitData();
    console.log(`[findMessageIdByRecruitId] メモリ上の募集データ数: ${Object.keys(allRecruitData).length}`);
    console.log(`[findMessageIdByRecruitId] 検索対象ID: "${recruitId}" (型: ${typeof recruitId})`);
    
    // デバッグ: 全ての保存されているデータを詳細出力
    for (const [message_id, data] of Object.entries(allRecruitData)) {
      const storedRecruitId = data.recruitId || message_id.slice(-8);
      console.log(`[findMessageIdByRecruitId] 保存データ: message_id=${message_id}, data.recruitId="${data.recruitId}", message_id下8桁="${message_id.slice(-8)}", 生成recruitId="${storedRecruitId}"`);
      console.log(`[findMessageIdByRecruitId] マッチ判定: data.recruitId=="${data.recruitId}" vs "${recruitId}" = ${data.recruitId === recruitId}, message_id下8桁=="${message_id.slice(-8)}" vs "${recruitId}" = ${message_id.slice(-8) === String(recruitId)}`);
    }
    
    for (const [message_id, data] of Object.entries(allRecruitData)) {
      console.log(`[findMessageIdByRecruitId] メモリ検索: message_id=${message_id}, data.recruitId=${data.recruitId}, 検索ID=${recruitId}`);
      // データに保存されているrecruitIdフィールド、または生成されたrecruitIdとマッチするかチェック
      if (data.recruitId === recruitId || data.recruitId === String(recruitId) || message_id.slice(-8) === String(recruitId)) {
        console.log(`[findMessageIdByRecruitId] メモリから発見: message_id=${message_id}`);
        return message_id;
      }
    }
    
    // メモリになければメッセージを検索
    console.log(`[findMessageIdByRecruitId] メモリに見つからず、メッセージ検索を開始`);
    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    console.log(`[findMessageIdByRecruitId] 取得したメッセージ数: ${messages.size}`);
    
    const botMessages = [];
    
    for (const [message_id, message] of messages) {
      // botのメッセージのみチェック
      if (message.author.id === interaction.client.user.id) {
        const messageRecruitId = String(message_id).slice(-8);
        // メッセージ内容から募集IDを抽出（Components v2のテキストから）
        let extractedRecruitId = null;
        if (message.components && message.components.length > 0) {
          try {
            // コンポーネントからテキストを検索
            const componentText = JSON.stringify(message.components);
            const idMatch = componentText.match(/募集ID：`(\d{8})`/);
            if (idMatch) {
              extractedRecruitId = idMatch[1];
            }
          } catch (e) {
            // コンポーネント解析エラーは無視
          }
        }
        // ログ出力もmessage_idで統一
        console.log(`[findMessageIdByRecruitId] Bot message found: message_id=${message_id}, message_id下8桁=${messageRecruitId}, 抽出ID=${extractedRecruitId}, hasComponents=${message.components && message.components.length > 0}`);
        botMessages.push({
          message_id,
          recruitId: messageRecruitId,
          extractedId: extractedRecruitId,
          hasComponents: message.components && message.components.length > 0,
          content: message.content ? message.content.substring(0, 50) + '...' : 'No content'
        });
        // メッセージIDの下8桁、または抽出されたIDが募集IDと一致するかチェック
        console.log(`[findMessageIdByRecruitId] ID比較: messageRecruitId="${messageRecruitId}" vs recruitId="${recruitId}" = ${messageRecruitId === String(recruitId)}`);
        if (extractedRecruitId) {
          console.log(`[findMessageIdByRecruitId] 抽出ID比較: extractedRecruitId="${extractedRecruitId}" vs recruitId="${recruitId}" = ${extractedRecruitId === String(recruitId)}`);
        }
        if (messageRecruitId === String(recruitId) || extractedRecruitId === String(recruitId)) {
          // botのメッセージで募集パネルかどうかチェック
          if (message.components && message.components.length > 0) {
            console.log(`[findMessageIdByRecruitId] 一致する募集を発見: message_id=${message_id} (${extractedRecruitId ? '抽出IDで一致' : 'messageIDで一致'})`);
            // メモリにデータがない場合でも、メッセージが存在すればそれを返す
            const hasMemoryData = gameRecruit.getRecruitData(message_id);
            if (!hasMemoryData) {
              console.log(`[findMessageIdByRecruitId] 警告: メッセージは存在するがメモリにデータなし`);
            }
            return message_id;
          } else {
            console.log(`[findMessageIdByRecruitId] IDは一致するがコンポーネントなし: message_id=${message_id}`);
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
  const safe = v => (v === undefined || v === null || v === '') ? ' ' : String(v);
  const modal = new ModalBuilder()
    .setCustomId(`editRecruitModal_${messageId}`)
    .setTitle('📝 募集内容編集');

  const titleInput = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('タイトル')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(safe(recruitData.title));

  const contentInput = new TextInputBuilder()
    .setCustomId('content')
    .setLabel('募集内容')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setValue(safe(recruitData.content));

  const participantsInput = new TextInputBuilder()
    .setCustomId('participants')
    .setLabel('参加人数（1-16）')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(2)
    .setValue(safe(recruitData.participants));

  const timeInput = new TextInputBuilder()
    .setCustomId('startTime')
    .setLabel('開始時間（例: 21:00）')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(safe(recruitData.startTime));

  const vcInput = new TextInputBuilder()
    .setCustomId('vc')
    .setLabel('VCの有無（あり / なし）')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(safe(recruitData.vc));

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
    } else {
      // 参加者がいない場合は募集主を初期参加者として追加
      participantText += `🎮 <@${newRecruitData.recruiterId}>`;
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
          .setCustomId("leave")
          .setLabel("退出")
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
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { roles: [], users: [] }
    });

    // DB上の募集データも更新（エラーハンドリングを追加）
    try {
      const { updateRecruitmentData } = require('../utils/db');
      await updateRecruitmentData(messageId, newRecruitData);
      console.log('データベースの募集データを更新しました');
    } catch (dbError) {
      console.error('データベース更新エラー（メッセージ更新は成功）:', dbError);
      // データベース更新が失敗してもメッセージ更新は成功しているので、エラーを投げない
    }

  } catch (error) {
    console.error('updateRecruitMessage error:', error);
    // データベース更新エラーの場合は、エラーメッセージに詳細を追加
    if (error.message && error.message.includes('Recruitment not found')) {
      const enhancedError = new Error('メッセージ更新は成功しましたが、データベース同期でエラーが発生しました: ' + error.message);
      enhancedError.originalError = error;
      throw enhancedError;
    }
    throw error;
  }
}

// 類似する募集IDを検索する関数
function findSimilarRecruitIds(searchId, allRecruitData) {
  const suggestions = [];
  const searchStr = String(searchId);
  
  for (const [message_id, data] of Object.entries(allRecruitData)) {
    const dataRecruitId = data.recruitId || message_id.slice(-8);
    if (!dataRecruitId) continue;
    
    console.log(`[findSimilarRecruitIds] 類似度計算: dataRecruitId="${dataRecruitId}" vs searchStr="${searchStr}"`);
    
    const similarity = calculateSimilarity(searchStr, dataRecruitId);
    
    // 30%以上の類似度があるもので、末尾4桁の一致度が高いものを候補とする
    if (similarity >= 0.3 || dataRecruitId.slice(-4) === searchStr.slice(-4)) {
      suggestions.push({
        id: dataRecruitId,
        title: data.title,
        similarity: similarity,
        message_id: message_id
      });
      console.log(`[findSimilarRecruitIds] 候補追加: id="${dataRecruitId}", similarity=${similarity}`);
    }
  }
  
  // 類似度順にソート
  suggestions.sort((a, b) => b.similarity - a.similarity);
  
  // 上位3件まで返す
  return suggestions.slice(0, 3);
}

// 数字文字列の類似度を計算する関数
function calculateSimilarity(str1, str2) {
  const s1 = String(str1);
  const s2 = String(str2);
  let matches = 0;
  const minLen = Math.min(s1.length, s2.length);
  
  // 末尾から一致する桁数をカウント
  for (let i = 0; i < minLen; i++) {
    if (s1[s1.length - 1 - i] === s2[s2.length - 1 - i]) {
      matches++;
    } else {
      break;
    }
  }
  
  return matches / Math.max(s1.length, s2.length);
}