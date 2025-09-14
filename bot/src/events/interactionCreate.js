module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // スラッシュコマンドの処理
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'コマンド実行中にエラーが発生しました。', ephemeral: true });
      }
      return;
    }

    // ボタンインタラクションの処理
    if (interaction.isButton()) {
      const { customId, user, message } = interaction;
      
      try {
        // 募集の参加者リストを管理する（メモリベース）
        if (!client.recruitments) {
          client.recruitments = new Map();
        }
        
        const messageId = message.id;
        
        // 初回の場合、募集データを初期化
        if (!client.recruitments.has(messageId)) {
          client.recruitments.set(messageId, {
            participants: [],
            status: 'OPEN'
          });
        }
        
        const recruitment = client.recruitments.get(messageId);
        
        switch (customId) {
          case 'join':
            await handleJoin(interaction, recruitment, user, client);
            break;
          case 'cancel':
            await handleCancel(interaction, recruitment, user, client);
            break;
          case 'close':
            await handleClose(interaction, recruitment, user, client);
            break;
          default:
            await interaction.reply({ content: '不明なボタンです。', ephemeral: true });
        }
      } catch (error) {
        console.error('ボタンインタラクション処理中にエラーが発生しました:', error);
        await interaction.reply({ content: 'エラーが発生しました。', ephemeral: true });
      }
    }
  },
};

// 参加処理
async function handleJoin(interaction, recruitment, user, client) {
  if (recruitment.status === 'CLOSED') {
    await interaction.reply({ content: '募集は締め切られています。', ephemeral: true });
    return;
  }
  
  // 既に参加しているかチェック
  if (recruitment.participants.some(p => p.id === user.id)) {
    await interaction.reply({ content: '既に参加済みです。', ephemeral: true });
    return;
  }
  
  // 参加者リストに追加
  recruitment.participants.push({
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username
  });
  
  // embedを更新
  await updateRecruitmentEmbed(interaction, recruitment);
  
  await interaction.reply({ content: '参加しました！', ephemeral: true });
}

// 取り消し処理
async function handleCancel(interaction, recruitment, user, client) {
  const index = recruitment.participants.findIndex(p => p.id === user.id);
  
  if (index === -1) {
    await interaction.reply({ content: '参加していません。', ephemeral: true });
    return;
  }
  
  // 参加者リストから削除
  recruitment.participants.splice(index, 1);
  
  // embedを更新
  await updateRecruitmentEmbed(interaction, recruitment);
  
  await interaction.reply({ content: '参加を取り消しました。', ephemeral: true });
}

// 締め処理
async function handleClose(interaction, recruitment, user, client) {
  // 募集者またはサーバー管理者のみ締めることができる（簡易実装）
  const member = await interaction.guild.members.fetch(user.id);
  if (!member.permissions.has('ManageMessages')) {
    // 募集者チェックも本来は必要だが、今回は権限チェックで代用
    await interaction.reply({ content: '募集を締める権限がありません。', ephemeral: true });
    return;
  }
  
  recruitment.status = 'CLOSED';
  
  // embedを更新
  await updateRecruitmentEmbed(interaction, recruitment);
  
  await interaction.reply({ content: '募集を締め切りました。', ephemeral: true });
}

// embed更新処理
async function updateRecruitmentEmbed(interaction, recruitment) {
  const { EmbedBuilder } = require('discord.js');
  
  // 参加者リストをメンション形式で作成（文字数制限対応）
  let participantList = '　'; // 空の場合はスペース
  if (recruitment.participants.length > 0) {
    const mentions = recruitment.participants.map(p => `<@${p.id}>`);
    participantList = mentions.join('\n');
    // 1024文字制限を超える場合は切り詰める
    if (participantList.length > 1000) {
      const truncatedMentions = [];
      let currentLength = 0;
      for (const mention of mentions) {
        if (currentLength + mention.length + 1 > 1000) {
          truncatedMentions.push('...(他にも参加者がいます)');
          break;
        }
        truncatedMentions.push(mention);
        currentLength += mention.length + 1;
      }
      participantList = truncatedMentions.join('\n');
    }
    // valueが空の場合はスペース
    if (!participantList || participantList.trim() === '') participantList = '　';
  }
  
  const statusEmoji = recruitment.status === 'CLOSED' ? '🔒' : '🎮';
  const statusText = recruitment.status === 'CLOSED' ? '【締切】' : '';
  
  const embed = new EmbedBuilder()
    .setTitle(`${statusEmoji} ${statusText}ゲーム募集`)
    .setDescription('**参加者募集中！**\n下のボタンで参加・取り消し・締めができます。')
    .addFields({
      name: `参加者 (${recruitment.participants.length}人)`,
      value: participantList,
      inline: false
    })
    .setColor(recruitment.status === 'CLOSED' ? 0x808080 : 0x5865f2);
  // 元のメッセージを編集（embedのみ更新）
  await interaction.message.edit({
    embeds: [embed.toJSON()]
  });
}
