const { EmbedBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');

// 募集画像・埋め込み生成のユーティリティ（仮実装）
module.exports = {
  async buildRecruitEmbed(options) {
    // options: { title, members, time, status }
    // 画像生成は後で実装
    const embed = new EmbedBuilder()
      .setTitle(options.title || 'ゲーム募集')
      .setDescription(`参加者: ${options.members?.length || 0}\n時間: ${options.time || '未定'}\n状態: ${options.status || 'OPEN'}`)
      .setColor(0x00bfff);
    return embed;
  },
  // Canvasによる画像生成は今後追加
};
