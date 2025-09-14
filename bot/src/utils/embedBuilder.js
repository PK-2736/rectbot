const { EmbedBuilder } = require('discord.js');
const { createCanvas } = require('canvas');

// 募集画像・埋め込み生成のユーティリティ（仮実装）
module.exports = {
  async buildRecruitEmbed(options) {
    // options: { title, members, time, status }
    // 画像生成は後で実装
    const embed = new EmbedBuilder()
      .setTitle(options.title || 'ゲーム募集')
      .setDescription(`参加者: ${options.members?.length || 0}\n時間: ${options.time || '未定'}\n状態: ${options.status || 'OPEN'}`)
      .setColor(0x00bfff);
    return embed.toJSON();
  },
  // 募集用の“ボタン風”画像を生成（Embedに埋め込むための視覚表現）
  async generateRecruitImage({ title = '募集テスト' } = {}) {
    const width = 900;
    const height = 360;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 背景
    ctx.fillStyle = '#0f172a'; // slate-900
    ctx.fillRect(0, 0, width, height);

    // ヘッダー
    ctx.fillStyle = '#38bdf8'; // sky-400
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(title, 32, 64);

    // 説明
    ctx.fillStyle = '#cbd5e1'; // slate-300
    ctx.font = '24px sans-serif';
    ctx.fillText('下のボタンで参加・取り消し・締めができます', 32, 110);

    // ボタン風の矩形を描画（見た目のみ）
    const btnY = height - 120;
    const btnW = 220;
    const btnH = 56;
    const gap = 24;
    const startX = 32;

    const buttons = [
      { label: '参加', color: '#22c55e' },    // green-500
      { label: '取り消し', color: '#64748b' }, // slate-500
      { label: '締め', color: '#ef4444' },     // red-500
    ];

    buttons.forEach((b, i) => {
      const x = startX + i * (btnW + gap);
      // 角丸ボタン
      const radius = 10;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.moveTo(x + radius, btnY);
      ctx.lineTo(x + btnW - radius, btnY);
      ctx.quadraticCurveTo(x + btnW, btnY, x + btnW, btnY + radius);
      ctx.lineTo(x + btnW, btnY + btnH - radius);
      ctx.quadraticCurveTo(x + btnW, btnY + btnH, x + btnW - radius, btnY + btnH);
      ctx.lineTo(x + radius, btnY + btnH);
      ctx.quadraticCurveTo(x, btnY + btnH, x, btnY + btnH - radius);
      ctx.lineTo(x, btnY + radius);
      ctx.quadraticCurveTo(x, btnY, x + radius, btnY);
      ctx.closePath();
      ctx.fill();

      // ラベル
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px sans-serif';
      const text = b.label;
      const textMetrics = ctx.measureText(text);
      const textX = x + (btnW - textMetrics.width) / 2;
      const textY = btnY + btnH / 2 + 8;
      ctx.fillText(text, textX, textY);
    });

    return canvas.toBuffer('image/png');
  },
};
