const { EmbedBuilder } = require('discord.js');

function getErrorDescription(errorCode) {
  if (errorCode === 50001) {
    return 'ボットがそのチャンネルにアクセスする権限がありません。';
  }
  if (errorCode === 50013) {
    return 'ボットがそのチャンネルで必要なアクション（メッセージ送信など）を実行する権限がありません。';
  }
  return '不明な権限エラーが発生しました。';
}

function buildErrorEmbedFields(errorDescription, channelName) {
  const fields = [
    { name: 'エラーの内容', value: errorDescription, inline: false }
  ];

  if (channelName) {
    fields.push({ name: 'チャンネル', value: `#${channelName}`, inline: false });
  }

  fields.push({
    name: '対処方法',
    value: 'サーバー管理者に以下の権限をボットのロールに付与してもらってください：\n• メッセージを送信\n• チャンネルを見る\n• メッセージを管理（編集・削除の場合）',
    inline: false
  });

  return fields;
}

function isPermissionError(errorCode) {
  return errorCode === 50001 || errorCode === 50013;
}

/**
 * 権限エラーをハンドルしてユーザーのDMにエラーメッセージを送信
 * @param {User|Object} user ユーザーオブジェクト
 * @param {Error} error エラーオブジェクト
 * @param {Object} options オプション
 * @param {string} options.channelName チャンネル名（わかれば）
 * @param {string} options.commandName コマンド名（わかれば）
 * @returns {Promise<void>}
 */
async function handlePermissionError(user, error, options = {}) {
  try {
    if (!user) {
      console.warn('[handlePermissionError] User not provided');
      return;
    }

    if (!isPermissionError(error.code)) {
      return;
    }

    const errorDescription = getErrorDescription(error.code);
    const fields = buildErrorEmbedFields(errorDescription, options.channelName);

    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('❌ 権限エラーが発生しました')
      .setDescription(`申し訳ございません。${options.commandName ? `**${options.commandName}**コマンド実行時に` : '操作時に'}権限エラーが発生しました。`)
      .addFields(...fields)
      .setFooter({ text: 'サポートが必要な場合は https://recrubo.net にアクセスしてください' })
      .setTimestamp();

    await user.send({ embeds: [embed] });
    console.log(`[handlePermissionError] 権限エラーメッセージを ${user.tag} に送信しました`);
  } catch (dmError) {
    console.error('[handlePermissionError] DMの送信に失敗:', dmError?.message || dmError);
  }
}

module.exports = { handlePermissionError };
