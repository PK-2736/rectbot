// const {
//   SlashCommandBuilder,
//   ModalBuilder,
//   TextInputBuilder,
//   TextInputStyle,
//   ActionRowBuilder,
//   MessageFlags,
//   EmbedBuilder
// } = require('discord.js');

// // gameRecruitから募集データをインポート
// const gameRecruit = require('./gameRecruit');

// module.exports = {
//   data: new SlashCommandBuilder()
//     .setName('rect-edit')
//     .setDescription('募集内容を編集します（/rect-edit 募集ID）')
//     .addStringOption(option =>
//       option.setName('募集id')
//         .setDescription('編集したい募集のID（募集パネル下部に表示される8桁の数字）')
//         .setRequired(true)
//         .setMaxLength(8)
//     ),

//   async execute(interaction) {
//     try {
//       const recruitId = interaction.options.getString('募集id');
//       console.log(`[editRecruit] 編集要求: recruitId=${recruitId}, user=${interaction.user.id}`);
      
//       // デバッグ: 現在のメモリ上の募集データを確認
//       const allRecruitData = gameRecruit.getAllRecruitData ? gameRecruit.getAllRecruitData() : 'getAllRecruitData method not available';
//       console.log(`[editRecruit] 現在のメモリ上の募集データ:`, allRecruitData);
      
//       // 募集IDから実際のメッセージIDを見つける
//       const messageId = await findMessageIdByRecruitId(interaction, recruitId);
      
//       if (!messageId) {
//         // メッセージが見つからない場合、メモリ上のデータから直接検索を試行
//         console.log(`[editRecruit] メッセージ検索失敗、メモリから直接検索を試行`);
//         const allRecruitData = gameRecruit.getAllRecruitData();
        
//         let foundMessageId = null;
//         for (const [msgId, data] of Object.entries(allRecruitData)) {
//           // データのrecruitIdフィールド、または生成されたrecruitIdとマッチするかチェック
//           const storedRecruitId = data.recruitId || msgId.slice(-8);
//           console.log(`[editRecruit] メモリ再検索: msgId=${msgId}, data.recruitId="${data.recruitId}", 生成ID="${msgId.slice(-8)}", 最終ID="${storedRecruitId}", 検索ID="${recruitId}"`);
//           console.log(`[editRecruit] マッチ判定: "${storedRecruitId}" === "${recruitId}" = ${storedRecruitId === recruitId}, "${msgId.slice(-8)}" === "${recruitId}" = ${msgId.slice(-8) === recruitId}`);
          
//           if (storedRecruitId === recruitId || msgId.slice(-8) === recruitId) {
//             foundMessageId = msgId;
//             console.log(`[editRecruit] メモリから発見: messageId=${msgId}, recruitId=${storedRecruitId}`);
//             break;
//           }
//         }
        
//         if (foundMessageId) {
//           // メモリから見つかった場合、そのIDを使用
//           const recruitData = gameRecruit.getRecruitData(foundMessageId);
//           if (recruitData && recruitData.recruiterId === interaction.user.id) {
//             await showEditModal(interaction, recruitData, foundMessageId);
//             return;
//           } else if (recruitData && recruitData.recruiterId !== interaction.user.id) {
//             await interaction.reply({
//               content: `❌ この募集の編集権限がありません。募集は募集主のみが編集できます。`,
//               flags: MessageFlags.Ephemeral
//             });
//             return;
//           }
//         }
        
//         // 類似IDを検索
//         const suggestions = findSimilarRecruitIds(recruitId, allRecruitData);
//         let suggestionText = '';
//         if (suggestions.length > 0) {
//           suggestionText = `\n\n**類似するIDが見つかりました:**\n${suggestions.map(s => `• \`${s.id}\` - ${s.title || '無題'} (類似度: ${Math.round(s.similarity * 100)}%)`).join('\n')}\n**これらのIDのいずれかを試してみてください。**`;
//         }
        
//         await interaction.reply({
//           content: `❌ 募集ID \`${recruitId}\` に対応する募集が見つかりませんでした。\n\n**利用可能な募集一覧:**\n${Object.entries(allRecruitData).length > 0 ? Object.entries(allRecruitData).map(([msgId, data]) => {
//             const displayId = data.recruitId || msgId.slice(-8);
//             return `• ID: \`${displayId}\` - ${data.title || '無題'} (作成者: <@${data.recruiterId}>)`;
//           }).join('\n') : '現在アクティブな募集はありません'}${suggestionText}\n\n**トラブルシューティング:**\n• 募集IDは8桁の数字です（例: \`12345678\`）\n• 募集が既に締め切られていないか確認してください\n• 他のチャンネルの募集ではないか確認してください\n• IDの一部だけ覚えている場合は、上記の利用可能なIDと比較してみてください`,
//           flags: MessageFlags.Ephemeral
//         });
//         return;
//       }

//       // 募集データを取得
//       const recruitData = gameRecruit.getRecruitData(messageId);
      
//       if (!recruitData) {
//         // メッセージは見つかったがメモリにデータがない場合の対処
//         console.log(`[editRecruit] メッセージは存在するがメモリにデータなし: messageId=${messageId}`);
        
//         // チャンネルから実際のメッセージを取得してデータを復元を試行
//         try {
//           const message = await interaction.channel.messages.fetch(messageId);
//           if (message && message.components && message.components.length > 0) {
//             await interaction.reply({
//               content: `❌ 募集ID \`${recruitId}\` の募集データがメモリから失われています。\n\nこれはボットが再起動されたか、一時的な問題が発生した可能性があります。\n\n**対処方法:**\n• ボット管理者に連絡してください\n• または新しい募集を作成し直してください`,
//               flags: MessageFlags.Ephemeral
//             });
//             return;
//           }
//         } catch (fetchError) {
//           console.error(`[editRecruit] メッセージ取得エラー:`, fetchError);
//         }
        
//         await interaction.reply({
//           content: `❌ 募集ID \`${recruitId}\` の募集データが見つかりませんでした。募集が既に締め切られているか、無効なIDです。`,
//           flags: MessageFlags.Ephemeral
//         });
//         return;
//       }

//       // 募集主の権限チェック
//       if (recruitData.recruiterId !== interaction.user.id) {
//         await interaction.reply({
//           content: `❌ この募集の編集権限がありません。募集は募集主のみが編集できます。`,
//           flags: MessageFlags.Ephemeral
//         });
//         return;
//       }

//       // 編集用モーダルを表示
//       await showEditModal(interaction, recruitData, messageId);

//     } catch (error) {
//       console.error('editRecruit execute error:', error);
//       if (!interaction.replied && !interaction.deferred) {
//         await interaction.reply({
//           content: 'エラーが発生しました。',
//           flags: MessageFlags.Ephemeral
//         });
//       }
//     }
//   },

//   // モーダル送信後の処理
//   async handleEditModalSubmit(interaction) {
//     // --- 募集数制限: 特定ギルド以外は1件まで ---
//     const EXEMPT_GUILD_ID = '1414530004657766422';
//     if (interaction.guildId !== EXEMPT_GUILD_ID) {
//       // gameRecruit.getAllRecruitData() から同じguildIdのアクティブ募集数をカウント
//       const allRecruitData = gameRecruit.getAllRecruitData ? gameRecruit.getAllRecruitData() : {};
//       let activeCount = 0;
//       for (const [_, data] of Object.entries(allRecruitData)) {
//         if (data && data.recruiterId && interaction.guildId === interaction.guildId) {
//           activeCount++;
//         }
//       }
//       if (activeCount >= 1) {
//         await interaction.reply({
//           content: '❌ このサーバーでは同時に実行できる募集は1件までです。既存の募集を締め切ってから編集してください。',
//           flags: MessageFlags.Ephemeral
//         });
//         return;
//       }
//     }
//     if (!interaction.customId.startsWith('editRecruitModal_')) return;
    
//     try {
//       // メッセージIDをカスタムIDから取得
//       const messageId = interaction.customId.replace('editRecruitModal_', '');
      
//       // 人数の入力値を検証
//       const participantsInput = interaction.fields.getTextInputValue('participants');
//       const participantsNum = parseInt(participantsInput);
      
//       if (isNaN(participantsNum) || participantsNum < 1 || participantsNum > 16) {
//         await interaction.reply({
//           content: '❌ 参加人数は1〜16の数字で入力してください。',
//           flags: MessageFlags.Ephemeral
//         });
//         return;
//       }

//       // 新しい募集データを取得
//       const newRecruitData = {
//         title: interaction.fields.getTextInputValue('title'),
//         content: interaction.fields.getTextInputValue('content'),
//         participants: participantsNum,
//         startTime: interaction.fields.getTextInputValue('startTime'),
//         vc: interaction.fields.getTextInputValue('vc'),
//         recruiterId: interaction.user.id // 募集主IDを保持
//       };

//       // 元の募集データを取得（変更前の内容と比較するため）
//       const originalData = gameRecruit.getRecruitData(messageId);

//       // 募集データを更新
//       gameRecruit.updateRecruitData(messageId, newRecruitData);

//       // 募集メッセージを更新
//       let dbUpdateSuccess = true;
//       let dbErrorMessage = '';
      
//       try {
//         await updateRecruitMessage(interaction, messageId, newRecruitData);
//       } catch (updateError) {
//         console.error('メッセージ更新エラー:', updateError);
        
//         // データベース更新エラーかどうかをチェック
//         if (updateError.message && (
//           updateError.message.includes('Recruitment not found') || 
//           updateError.message.includes('API error: 404') ||
//           updateError.originalError
//         )) {
//           dbUpdateSuccess = false;
//           dbErrorMessage = 'データベース同期に失敗しましたが、メッセージは正常に更新されました。';
//           console.warn('データベース更新失敗、メッセージ更新は成功として処理継続');
//         } else {
//           // 他のエラーは再スロー
//           throw updateError;
//         }
//       }

//       // 変更内容を詳細に表示
//       const changes = [];
//       const oldData = originalData || {};
      
//       if (oldData.title !== newRecruitData.title) {
//         changes.push(`**タイトル**: \`${oldData.title || '(なし)'}\` → \`${newRecruitData.title}\``);
//       }
//       if (oldData.content !== newRecruitData.content) {
//         changes.push(`**募集内容**: \`${(oldData.content || '').substring(0, 30)}${oldData.content && oldData.content.length > 30 ? '...' : ''}\` → \`${newRecruitData.content.substring(0, 30)}${newRecruitData.content.length > 30 ? '...' : ''}\``);
//       }
//       if (oldData.participants !== newRecruitData.participants) {
//         changes.push(`**参加人数**: \`${oldData.participants || 0}人\` → \`${newRecruitData.participants}人\``);
//       }
//       if (oldData.startTime !== newRecruitData.startTime) {
//         changes.push(`**開始時間**: \`${oldData.startTime || '(なし)'}\` → \`${newRecruitData.startTime}\``);
//       }
//       if (oldData.vc !== newRecruitData.vc) {
//         changes.push(`**VC**: \`${oldData.vc || '(なし)'}\` → \`${newRecruitData.vc}\``);
//       }

//       // 成功メッセージ
//       const successEmbed = new EmbedBuilder()
//         .setColor(dbUpdateSuccess ? 0x00FF00 : 0xFFA500) // 完全成功は緑、部分成功はオレンジ
//         .setTitle(dbUpdateSuccess ? '✅ 募集編集完了' : '⚠️ 募集編集完了（一部警告）')
//         .setDescription(`募集ID \`${messageId.slice(-8)}\` の内容を更新しました。${!dbUpdateSuccess ? '\n' + dbErrorMessage : ''}`)
//         .addFields(
//           { name: '📝 変更された項目', value: changes.length > 0 ? changes.join('\n') : '変更はありませんでした', inline: false },
//           { name: '🔗 募集リンク', value: `[編集された募集を確認する](https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${messageId})`, inline: false }
//         )
//         .setTimestamp()
//         .setFooter({ text: 'rectbot 編集機能', iconURL: interaction.client.user.displayAvatarURL() });
      
//       if (!dbUpdateSuccess) {
//         successEmbed.addFields({
//           name: '📋 注意事項',
//           value: '募集の編集は正常に完了しましたが、管理システムとの同期で問題が発生しました。募集機能は正常に動作します。',
//           inline: false
//         });
//       }

//       await interaction.reply({
//         embeds: [successEmbed],
//         flags: MessageFlags.Ephemeral
//       });

//       // 募集主に編集完了を通知（チャンネルに公開メッセージとして送信）
//       const notificationEmbed = new EmbedBuilder()
//         .setColor(0x3498db)
//         .setTitle('📝 募集が変更されました')
//         .setDescription(`<@${newRecruitData.recruiterId}> が募集内容を更新しました。`)
//         .addFields(
//           { name: '📋 募集タイトル', value: newRecruitData.title, inline: false },
//           { name: '🔢 募集ID', value: `\`${messageId.slice(-8)}\``, inline: true },
//           { name: '👥 参加人数', value: `${newRecruitData.participants}人`, inline: true },
//           { name: '⏰ 開始時間', value: newRecruitData.startTime, inline: true }
//         )
//         .setTimestamp();

//       // 変更内容が1つ以上ある場合のみ、変更詳細を追加
//       if (changes.length > 0) {
//         notificationEmbed.addFields(
//           { name: '📝 変更内容', value: changes.slice(0, 3).join('\n') + (changes.length > 3 ? '\n...他' : ''), inline: false }
//         );
//       }

//       const notificationMessage = await interaction.channel.send({
//         embeds: [notificationEmbed],
//         allowedMentions: { users: [newRecruitData.recruiterId] }
//       });

//       // 30秒後に通知メッセージを削除
//       setTimeout(async () => {
//         try {
//           await notificationMessage.delete();
//         } catch (error) {
//           console.log('編集通知メッセージの削除に失敗:', error.message);
//         }
//       }, 30 * 1000); // 30秒

//     } catch (error) {
//       console.error('editRecruit handleModalSubmit error:', error);
//       if (!interaction.replied && !interaction.deferred) {
//         await interaction.reply({
//           content: 'エラーが発生しました。',
//           flags: MessageFlags.Ephemeral
//         });
//       }
//     }
//   }
// };

// // 募集IDから実際のメッセージIDを見つける関数
// async function findMessageIdByRecruitId(interaction, recruitId) {
//   // 現在のチャンネルで最近のメッセージを検索
//   try {
//     console.log(`[findMessageIdByRecruitId] 検索開始: recruitId=${recruitId}`);
    
//     // まずメモリから直接検索
//     const allRecruitData = gameRecruit.getAllRecruitData();
//     console.log(`[findMessageIdByRecruitId] メモリ上の募集データ数: ${Object.keys(allRecruitData).length}`);
//     console.log(`[findMessageIdByRecruitId] 検索対象ID: "${recruitId}" (型: ${typeof recruitId})`);
    
//     // デバッグ: 全ての保存されているデータを詳細出力
//     for (const [messageId, data] of Object.entries(allRecruitData)) {
//       const storedRecruitId = data.recruitId || messageId.slice(-8);
//       console.log(`[findMessageIdByRecruitId] 保存データ: messageId=${messageId}, data.recruitId="${data.recruitId}", messageId下8桁="${messageId.slice(-8)}", 生成recruitId="${storedRecruitId}"`);
//       console.log(`[findMessageIdByRecruitId] マッチ判定: data.recruitId=="${data.recruitId}" vs "${recruitId}" = ${data.recruitId === recruitId}, messageId下8桁=="${messageId.slice(-8)}" vs "${recruitId}" = ${messageId.slice(-8) === String(recruitId)}`);
//     }
    
//     for (const [messageId, data] of Object.entries(allRecruitData)) {
//       console.log(`[findMessageIdByRecruitId] メモリ検索: messageId=${messageId}, data.recruitId=${data.recruitId}, 検索ID=${recruitId}`);
//       // データに保存されているrecruitIdフィールド、または生成されたrecruitIdとマッチするかチェック
//       if (data.recruitId === recruitId || data.recruitId === String(recruitId) || messageId.slice(-8) === String(recruitId)) {
//         console.log(`[findMessageIdByRecruitId] メモリから発見: messageId=${messageId}`);
//         return messageId;
//       }
//     }
    
//     // メモリになければメッセージを検索
//     console.log(`[findMessageIdByRecruitId] メモリに見つからず、メッセージ検索を開始`);
//     const messages = await interaction.channel.messages.fetch({ limit: 100 });
//     console.log(`[findMessageIdByRecruitId] 取得したメッセージ数: ${messages.size}`);
    
//     const botMessages = [];
    
//     for (const [messageId, message] of messages) {
//       // botのメッセージのみチェック
//       if (message.author.id === interaction.client.user.id) {
//         const messageRecruitId = String(messageId).slice(-8);
        
//         // メッセージ内容から募集IDを抽出（Components v2のテキストから）
//         let extractedRecruitId = null;
//         if (message.components && message.components.length > 0) {
//           try {
//             // コンポーネントからテキストを検索
//             const componentText = JSON.stringify(message.components);
//             const idMatch = componentText.match(/募集ID：`(\d{8})`/);
//             if (idMatch) {
//               extractedRecruitId = idMatch[1];
//             }
//           } catch (e) {
//             // コンポーネント解析エラーは無視
//           }
//         }
        
//         console.log(`[findMessageIdByRecruitId] Bot message found: messageId=${messageId}, messageId下8桁=${messageRecruitId}, 抽出ID=${extractedRecruitId}, hasComponents=${message.components && message.components.length > 0}`);
        
//         botMessages.push({
//           messageId,
//           recruitId: messageRecruitId,
//           extractedId: extractedRecruitId,
//           hasComponents: message.components && message.components.length > 0,
//           content: message.content ? message.content.substring(0, 50) + '...' : 'No content'
//         });
        
//         // メッセージIDの下8桁、または抽出されたIDが募集IDと一致するかチェック
//         console.log(`[findMessageIdByRecruitId] ID比較: messageRecruitId="${messageRecruitId}" vs recruitId="${recruitId}" = ${messageRecruitId === String(recruitId)}`);
//         if (extractedRecruitId) {
//           console.log(`[findMessageIdByRecruitId] 抽出ID比較: extractedRecruitId="${extractedRecruitId}" vs recruitId="${recruitId}" = ${extractedRecruitId === String(recruitId)}`);
//         }
        
//         if (messageRecruitId === String(recruitId) || extractedRecruitId === String(recruitId)) {
//           // botのメッセージで募集パネルかどうかチェック
//           if (message.components && message.components.length > 0) {
//             console.log(`[findMessageIdByRecruitId] 一致する募集を発見: messageId=${messageId} (${extractedRecruitId ? '抽出IDで一致' : 'messageIDで一致'})`);
            
//             // メモリにデータがない場合でも、メッセージが存在すればそれを返す
//             const hasMemoryData = gameRecruit.getRecruitData(messageId);
//             if (!hasMemoryData) {
//               console.log(`[findMessageIdByRecruitId] 警告: メッセージは存在するがメモリにデータなし`);
//             }
//             return messageId;
//           } else {
//             console.log(`[findMessageIdByRecruitId] IDは一致するがコンポーネントなし: messageId=${messageId}`);
//           }
//         }
//       }
//     }
    
//     console.log(`[findMessageIdByRecruitId] 全てのbotメッセージ:`, botMessages);
//     console.log(`[findMessageIdByRecruitId] 募集ID ${recruitId} に一致するメッセージが見つかりませんでした`);
//     return null;
//   } catch (error) {
//     console.error('findMessageIdByRecruitId error:', error);
//     return null;
//   }
// }

// // 編集用モーダルを表示する関数
// async function showEditModal(interaction, recruitData, messageId) {
//   const modal = new ModalBuilder()
//     .setCustomId(`editRecruitModal_${messageId}`)
//     .setTitle('📝 募集内容編集');

//   const titleInput = new TextInputBuilder()
//     .setCustomId('title')
//     .setLabel('タイトル')
//     .setStyle(TextInputStyle.Short)
//     .setRequired(true)
//     .setValue(recruitData.title || ''); // 既存値を設定

//   const contentInput = new TextInputBuilder()
//     .setCustomId('content')
//     .setLabel('募集内容')
//     .setStyle(TextInputStyle.Paragraph)
//     .setRequired(true)
//     .setMaxLength(1000)
//     .setValue(recruitData.content || ''); // 既存値を設定

//   const participantsInput = new TextInputBuilder()
//     .setCustomId('participants')
//     .setLabel('参加人数（1-16）')
//     .setStyle(TextInputStyle.Short)
//     .setRequired(true)
//     .setMinLength(1)
//     .setMaxLength(2)
//     .setValue(String(recruitData.participants || '')); // 既存値を設定

//   const timeInput = new TextInputBuilder()
//     .setCustomId('startTime')
//     .setLabel('開始時間（例: 21:00）')
//     .setStyle(TextInputStyle.Short)
//     .setRequired(true)
//     .setValue(recruitData.startTime || ''); // 既存値を設定

//   const vcInput = new TextInputBuilder()
//     .setCustomId('vc')
//     .setLabel('VCの有無（あり / なし）')
//     .setStyle(TextInputStyle.Short)
//     .setRequired(true)
//     .setValue(recruitData.vc || ''); // 既存値を設定

//   modal.addComponents(
//     new ActionRowBuilder().addComponents(titleInput),
//     new ActionRowBuilder().addComponents(contentInput),
//     new ActionRowBuilder().addComponents(participantsInput),
//     new ActionRowBuilder().addComponents(timeInput),
//     new ActionRowBuilder().addComponents(vcInput)
//   );

//   await interaction.showModal(modal);
// }

// // 募集メッセージを更新する関数
// async function updateRecruitMessage(interaction, messageId, newRecruitData) {
//   try {
//     // 元のメッセージを取得
//     const message = await interaction.channel.messages.fetch(messageId);
    
//     // 新しい画像を生成
//     const { generateRecruitCard } = require('../utils/canvasRecruit');
//     const participants = gameRecruit.getParticipants(messageId) || [];
//     const buffer = await generateRecruitCard(newRecruitData, participants, interaction.client);
    
//     // 新しい画像でメッセージを更新
//     const { 
//       AttachmentBuilder, 
//       ContainerBuilder, 
//       TextDisplayBuilder,
//       SeparatorBuilder, 
//       SeparatorSpacingSize,
//       ButtonBuilder, 
//       ButtonStyle,
//       ActionRowBuilder,
//       MediaGalleryBuilder,
//       MediaGalleryItemBuilder,
//       MessageFlags
//     } = require('discord.js');
    
//     const image = new AttachmentBuilder(buffer, { name: 'recruit-card.png' });
//     const user = interaction.user;
    
//     // 参加者リスト表示を再構築
//     let participantText = `🎯✨ 参加リスト ✨🎯\n`;
//     if (participants.length > 0) {
//       participantText += participants.map(userId => `🎮 <@${userId}>`).join('\n');
//     } else {
//       // 参加者がいない場合は募集主を初期参加者として追加
//       participantText += `🎮 <@${newRecruitData.recruiterId}>`;
//     }

//     const container = new ContainerBuilder();
//     container.setAccentColor(0xFF69B4);

//     // ユーザー名表示
//     container.addTextDisplayComponents(
//       new TextDisplayBuilder().setContent(`🎮✨ **${user.username}さんの募集** ✨🎮`)
//     );

//     container.addSeparatorComponents(
//       new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
//     );

//     container.addMediaGalleryComponents(
//       new MediaGalleryBuilder().addItems(
//         new MediaGalleryItemBuilder().setURL('attachment://recruit-card.png')
//       )
//     )
//     container.addSeparatorComponents(
//       new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
//     )
//     .addTextDisplayComponents(
//       new TextDisplayBuilder().setContent(participantText)
//     )

//     container.addActionRowComponents(
//       new ActionRowBuilder().addComponents(
//         new ButtonBuilder()
//           .setCustomId("join")
//           .setLabel("参加")
//           .setEmoji('✅')
//           .setStyle(ButtonStyle.Success),
//         new ButtonBuilder()
//           .setCustomId("leave")
//           .setLabel("退出")
//           .setEmoji('✖️')
//           .setStyle(ButtonStyle.Danger),
//         new ButtonBuilder()
//           .setCustomId("close")
//           .setLabel("締め")
//           .setStyle(ButtonStyle.Secondary)
//       )
//     )
//     .addSeparatorComponents(
//       new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
//     )
//     .addTextDisplayComponents(
//       new TextDisplayBuilder().setContent(`募集ID：\`${messageId.slice(-8)}\` | powered by **rectbot**`)
//     );

//     // メッセージを更新
//     await message.edit({
//       files: [image],
//       components: [container],
//       flags: MessageFlags.IsComponentsV2,
//       allowedMentions: { roles: [], users: [] }
//     });

//     // DB上の募集データも更新（エラーハンドリングを追加）
//     try {
//       const { updateRecruitmentData } = require('../utils/database');
//       await updateRecruitmentData(messageId, newRecruitData);
//       console.log('データベースの募集データを更新しました');
//     } catch (dbError) {
//       console.error('データベース更新エラー（メッセージ更新は成功）:', dbError);
//       // データベース更新が失敗してもメッセージ更新は成功しているので、エラーを投げない
//     }

//   } catch (error) {
//     console.error('updateRecruitMessage error:', error);
//     // データベース更新エラーの場合は、エラーメッセージに詳細を追加
//     if (error.message && error.message.includes('Recruitment not found')) {
//       const enhancedError = new Error('メッセージ更新は成功しましたが、データベース同期でエラーが発生しました: ' + error.message);
//       enhancedError.originalError = error;
//       throw enhancedError;
//     }
//     throw error;
//   }
// }

// // 類似する募集IDを検索する関数
// function findSimilarRecruitIds(searchId, allRecruitData) {
//   const suggestions = [];
//   const searchStr = String(searchId);
  
//   for (const [messageId, data] of Object.entries(allRecruitData)) {
//     const dataRecruitId = data.recruitId || messageId.slice(-8);
//     if (!dataRecruitId) continue;
    
//     console.log(`[findSimilarRecruitIds] 類似度計算: dataRecruitId="${dataRecruitId}" vs searchStr="${searchStr}"`);
    
//     const similarity = calculateSimilarity(searchStr, dataRecruitId);
    
//     // 30%以上の類似度があるもので、末尾4桁の一致度が高いものを候補とする
//     if (similarity >= 0.3 || dataRecruitId.slice(-4) === searchStr.slice(-4)) {
//       suggestions.push({
//         id: dataRecruitId,
//         title: data.title,
//         similarity: similarity,
//         messageId: messageId
//       });
//       console.log(`[findSimilarRecruitIds] 候補追加: id="${dataRecruitId}", similarity=${similarity}`);
//     }
//   }
  
//   // 類似度順にソート
//   suggestions.sort((a, b) => b.similarity - a.similarity);
  
//   // 上位3件まで返す
//   return suggestions.slice(0, 3);
// }

// // 数字文字列の類似度を計算する関数
// function calculateSimilarity(str1, str2) {
//   const s1 = String(str1);
//   const s2 = String(str2);
//   let matches = 0;
//   const minLen = Math.min(s1.length, s2.length);
  
//   // 末尾から一致する桁数をカウント
//   for (let i = 0; i < minLen; i++) {
//     if (s1[s1.length - 1 - i] === s2[s2.length - 1 - i]) {
//       matches++;
//     } else {
//       break;
//     }
//   }
  
//   return matches / Math.max(s1.length, s2.length);
// }