const { EmbedBuilder } = require('discord.js');

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

    // 権限エラーかどうか確認
    if (error.code !== 50001 && error.code !== 50013) {
      return;
    }

    const errorDescription = (() => {
      if (error.code === 50001) {
        return 'ボットがそのチャンネルにアクセスする権限がありません。';
      } else if (error.code === 50013) {
        return 'ボットがそのチャンネルで必要なアクション（メッセージ送信など）を実行する権限がありません。';
      }
    })();

    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('❌ 権限エラーが発生しました')
      .setDescription(`申し訳ございません。${options.commandName ? `**${options.commandName}**コマンド実行時に` : '操作時に'}権限エラーが発生しました。`)
      .addFields(
        { name: 'エラーの内容', value: errorDescription, inline: false },
        ...(options.channelName ? [{ name: 'チャンネル', value: `#${options.channelName}`, inline: false }] : []),
        { name: '対処方法', value: 'サーバー管理者に以下の権限をボットのロールに付与してもらってください：\n• メッセージを送信\n• チャンネルを見る\n• メッセージを管理（編集・削除の場合）', inline: false }
      )
      .setFooter({ text: 'サポートが必要な場合は https://recrubo.net にアクセスしてください' })
      .setTimestamp();

    await user.send({ embeds: [embed] });
    console.log(`[handlePermissionError] 権限エラーメッセージを ${user.tag} に送信しました`);
  } catch (dmError) {
    console.error('[handlePermissionError] DMの送信に失敗:', dmError?.message || dmError);
  }
}

module.exports = { handlePermissionError };
