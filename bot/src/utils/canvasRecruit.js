// Canvas画像生成用ユーティリティ
const { createCanvas, registerFont, loadImage } = require('canvas');
registerFont(__dirname + '/../../data/Corporate-Logo-Rounded-Bold-ver3.otf', { family: 'CorporateRounded' });

/**
 * 募集カード画像を生成（スプラ風レイアウト）
 * @param {Object} recruitData 募集内容データ
 * @param {Array} participantIds 参加者のDiscord IDリスト
 * @param {Client} client Discordクライアント
 * @returns {Buffer} PNG画像バッファ
 */
async function generateRecruitCard(recruitData, participantIds = [], client = null) {
  const width = 140;
  const height = 90;
  const scale = 5; // 高解像度で生成（5倍スケール - 3倍から向上）
  const canvas = createCanvas(width * scale, height * scale);
  const ctx = canvas.getContext('2d');

  // アンチエイリアシング有効化（最高品質設定）
  ctx.textRenderingOptimization = 'optimizeQuality';
  ctx.quality = 'best';
  ctx.patternQuality = 'best';
  ctx.textDrawingMode = 'path';
  ctx.antialias = 'subpixel';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // スケール調整
  ctx.scale(scale, scale);

  // 背景
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, width, height);

  // グラデーション枠
  // 線形グラデーション（左上から右下へ）
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#ff6b9d');    // ピンク
  gradient.addColorStop(0.3, '#c44569');  // 深いピンク
  gradient.addColorStop(0.7, '#786fa6');  // 紫
  gradient.addColorStop(1, '#4834d4');    // 青紫
  
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, width, height);

  // タイトル表示（一番上）
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 8px CorporateRounded';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  
  const title = recruitData.title || 'ゲーム募集';
  const titleMaxWidth = width - 16; // 左右のマージン
  let titleText = title;
  
  // タイトルが長すぎる場合は省略
  if (ctx.measureText(titleText).width > titleMaxWidth) {
    while (ctx.measureText(titleText + '...').width > titleMaxWidth && titleText.length > 1) {
      titleText = titleText.substring(0, titleText.length - 1);
    }
    titleText += '...';
  }
  
  ctx.fillText(titleText, width / 2, 8);
  
  // テキストアライメントをリセット
  ctx.textAlign = 'start';
  ctx.textBaseline = 'top';

  // 掲示板風ピン装飾（控えめ）
  function drawPin(x, y, color) {
    // ピンの影（薄く）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.beginPath();
    ctx.arc(x + 1, y + 1, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // ピン本体（小さく）
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // ピンの光沢（控えめ）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(x - 0.5, y - 0.5, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // 募集内容用の枠（タイトルと適切な間隔を保って配置）
  const boxX = 8;
  const boxY = height * 0.35; // 35%の位置（42%から上に調整）
  const boxWidth = width * 0.5; // 画像幅の50%
  const boxHeight = height * 0.55; // 画像高さの55%（50%から拡大）
  
  // 上側のピンのみ配置（タイトルと被らないように下に移動）
  drawPin(6, 18, 'rgba(255, 71, 87, 0.7)');   // 左上 - 淡い赤
  drawPin(width - 6, 18, 'rgba(46, 213, 115, 0.7)');   // 右上 - 淡い緑
  
  // 角丸矩形を描画する関数
  function drawRoundedRect(x, y, width, height, radius, fill = true, stroke = false) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }
  
  // 背景と同じ色のボックス（角丸）
  ctx.fillStyle = '#222';
  drawRoundedRect(boxX, boxY, boxWidth, boxHeight, 6, true, false);
  
  // 白い枠線のみ（角丸）
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 1;
  drawRoundedRect(boxX, boxY, boxWidth, boxHeight, 6, false, true);
  
  // 参加者円の描画（タイトルと募集内容枠の間に適切に配置）
  const participantCount = recruitData.participants || 4;
  const circleRadius = 6.5; // 8から6.5に縮小
  const circleSpacing = 20;
  const participantAreaY = boxY - 10; // 募集内容枠の上に適切な間隔
  const participantAreaX = boxX + 5;
  
  // アバター描画のヘルパー関数
  async function drawParticipantAvatar(x, y, userId) {
    // ユーザーIDの検証を追加
    if (!userId || userId === 'null' || userId === null || userId === undefined) {
      console.error(`Invalid userId provided: ${userId}`);
      // フォールバック：デフォルトアバターを描画
      ctx.fillStyle = '#5865F2';
      ctx.beginPath();
      ctx.arc(x, y, circleRadius, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.fillStyle = 'white';
      ctx.font = '8px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('?', x, y + 3);
      return;
    }

    try {
      const user = await client.users.fetch(userId);
      const avatarURL = user.displayAvatarURL({ extension: 'png', size: 128 }); // 32から128に増加
      const avatar = await loadImage(avatarURL);
      
      // 円形にクリップして描画
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, circleRadius, 0, 2 * Math.PI);
      ctx.clip();
      ctx.drawImage(avatar, x - circleRadius, y - circleRadius, circleRadius * 2, circleRadius * 2);
      ctx.restore();
      
      console.log(`Avatar loaded for user ${user.username}`);
    } catch (error) {
      console.error(`Failed to load avatar for user ${userId}:`, error);
      
      // フォールバック：デフォルトアバターまたは文字表示
      ctx.fillStyle = '#5865F2';
      ctx.beginPath();
      ctx.arc(x, y, circleRadius, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.fillStyle = 'white';
      ctx.font = '8px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('?', x, y + 3);
    }
  }
  
  function drawDefaultParticipant(participantId, x, y) {
    // 参加者円の背景（少し濃い色）
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // 円の枠線
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // イニシャル表示
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8px CorporateRounded';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const initial = participantId.slice(-1).toUpperCase();
    ctx.fillText(initial, x, y);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'top';
  }
  
  // 各参加者円を描画
  for (let i = 0; i < participantCount; i++) {
    const circleX = participantAreaX + i * circleSpacing;
    const circleY = participantAreaY;
    
    if (i < participantIds.length) {
      // 参加者がいる場合はアバターを描画（引数の順序を修正）
      await drawParticipantAvatar(circleX, circleY, participantIds[i]);
    } else {
      // 空の場合は薄い+マークを表示
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(circleX, circleY, circleRadius, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(circleX, circleY, circleRadius, 0, Math.PI * 2);
      ctx.stroke();
      
      // +マーク
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(circleX - 4, circleY);
      ctx.lineTo(circleX + 4, circleY);
      ctx.moveTo(circleX, circleY - 4);
      ctx.lineTo(circleX, circleY + 4);
      ctx.stroke();
    }
  }
  
  // 募集内容テキストの表示
  ctx.fillStyle = '#fff';
  ctx.font = '6px CorporateRounded';
  ctx.textBaseline = 'top';
  
  // 「募集内容」ラベル
  ctx.font = 'bold 6px CorporateRounded';
  ctx.fillStyle = '#bbb'; // #cccから#bbbに変更（人数等と同じ色）
  ctx.fillText('募集内容', boxX + 4, boxY + 3);
  
  // 実際の募集内容を表示
  ctx.font = '4px CorporateRounded'; // 7pxから6pxに縮小
  ctx.fillStyle = '#fff';
  const content = recruitData.content || 'ガチエリア / 初心者歓迎';
  const lineHeight = 6; // 13から10に縮小（上下間隔を狭く）
  const maxLines = Math.floor((boxHeight - 20) / lineHeight); // ラベル分を除く（拡大した枠に対応）
  // 枠幅に合わせて自動改行
  let wrappedLines = [];
  content.split(/\r?\n/).forEach(rawLine => {
    let line = '';
    for (let char of rawLine) {
      if (ctx.measureText(line + char).width > boxWidth - 16) {
        wrappedLines.push(line);
        line = '';
      }
      line += char;
    }
    if (line) wrappedLines.push(line);
  });
  for (let i = 0; i < Math.min(wrappedLines.length, maxLines); i++) {
    ctx.fillText(wrappedLines[i], boxX + 4, boxY + 15 + i * lineHeight);
  }
  
  // 右上から縦に並べて表示（タイトルとバランスを取って配置）
  const rightX = width - 56; // 右上の位置
  const startY = 30; // タイトルとのバランスを考慮（35から30に調整）
  const itemSpacing = 18; // 各項目の間隔（20から18に縮小してコンパクトに）
  const infoBoxWidth = 50; // 各情報ボックスの幅
  const infoBoxHeight = 15; // 各情報ボックスの高さ
  
  // 情報配列
  const infoItems = [
    { label: '人数：', value: `${participantIds.length}/${recruitData.participants || 4}人` },
    { label: '時間：', value: recruitData.startTime || '未定' },
    { label: '通話：', value: recruitData.vc || '未定' }
  ];
  
  // 各情報を縦に並べて表示
  infoItems.forEach((item, index) => {
    const itemY = startY + (index * itemSpacing);
    
    // 背景矩形
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    drawRoundedRect(rightX, itemY, infoBoxWidth, infoBoxHeight, 3, true, false);
    
    // 枠線
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 0.5;
    drawRoundedRect(rightX, itemY, infoBoxWidth, infoBoxHeight, 3, false, true);
    
    // ラベル（左側）
    ctx.fillStyle = '#bbb';
    ctx.font = 'bold 4px CorporateRounded';
    ctx.fillText(item.label, rightX + 3, itemY + 6);
    
    // 値（右側）
    ctx.fillStyle = '#fff';
    ctx.font = '4px CorporateRounded';
    let value = item.value;
    // テキストが長すぎる場合は省略
    const maxWidth = infoBoxWidth - 25; // ラベル分を除いた幅
    if (ctx.measureText(value).width > maxWidth) {
      while (ctx.measureText(value + '...').width > maxWidth && value.length > 1) {
        value = value.substring(0, value.length - 1);
      }
      value += '...';
    }
    ctx.fillText(value, rightX + 22, itemY + 6);
  });

  // 紙が少し浮いているような影効果
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  return canvas.toBuffer('image/png');
}

module.exports = { generateRecruitCard };