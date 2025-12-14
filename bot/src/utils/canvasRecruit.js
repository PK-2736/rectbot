// Canvas画像生成用ユーティリティ
const { createCanvas, registerFont, loadImage } = require('canvas');
registerFont(__dirname + '/../../data/Corporate-Logo-Rounded-Bold-ver3.otf', { family: 'CorporateRounded' });

/**
       // フォールバック：デフォルトアバターまたは文字表示
      ctx.fillStyle = '#5865F2';
      ctx.beginPath();
      ctx.arc(x, y, circleRadius, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.fillStyle = 'white';
      ctx.font = `${is2Rows ? '5px' : '8px'} Arial`; // サイズを調整（4pxから5pxに）
      ctx.textAlign = 'center';
      ctx.fillText('?', x, y + (is2Rows ? 2 : 3));生成（スプラ風レイアウト）
 * @param {Object} recruitData 募集内容データ
 * @param {Array} participantIds 参加者のDiscord IDリスト
 * @param {Client} client Discordクライアント
 * @returns {Buffer} PNG画像バッファ
 */
async function generateRecruitCard(recruitData, participantIds = [], client = null, accentColor = null) {
  const width = 140;
  const height = 100; // 90から100に拡大（上に10ピクセル拡張）
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

  // 背景を透明のまま維持
  ctx.clearRect(0, 0, width, height);

  // グラデーション枠
  // 線形グラデーション（左上から右下へ）
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  
  if (accentColor) {
    // アクセントカラーが指定されている場合
    const baseColor = `#${accentColor}`;
    
    // アクセントカラーをベースにしたグラデーション
    const r = parseInt(accentColor.substr(0, 2), 16);
    const g = parseInt(accentColor.substr(2, 2), 16);
    const b = parseInt(accentColor.substr(4, 2), 16);
    
    // 明るい色
    const lightR = Math.min(255, r + 40);
    const lightG = Math.min(255, g + 40);
    const lightB = Math.min(255, b + 40);
    
    // 暗い色
    const darkR = Math.max(0, r - 40);
    const darkG = Math.max(0, g - 40);
    const darkB = Math.max(0, b - 40);
    
    gradient.addColorStop(0, `rgb(${lightR}, ${lightG}, ${lightB})`);
    gradient.addColorStop(0.5, baseColor);
    gradient.addColorStop(1, `rgb(${darkR}, ${darkG}, ${darkB})`);
  } else {
    // デフォルトカラー
    gradient.addColorStop(0, '#ff6b9d');    // ピンク
    gradient.addColorStop(0.3, '#c44569');  // 深いピンク
    gradient.addColorStop(0.7, '#786fa6');  // 紫
    gradient.addColorStop(1, '#4834d4');    // 青紫
  }
  
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, width, height);

  // タイトル表示（装飾付きで一番上に配置）
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
  
  // タイトル背景の装飾（半透明の背景）
  const titleWidth = ctx.measureText(titleText).width;
  const titleBgX = (width - titleWidth) / 2 - 6;
  const titleBgY = 3;
  const titleBgWidth = titleWidth + 12;
  const titleBgHeight = 12;
  
  // グラデーション背景
  const titleGradient = ctx.createLinearGradient(titleBgX, titleBgY, titleBgX + titleBgWidth, titleBgY + titleBgHeight);
  
  if (accentColor) {
    const r = parseInt(accentColor.substr(0, 2), 16);
    const g = parseInt(accentColor.substr(2, 2), 16);
    const b = parseInt(accentColor.substr(4, 2), 16);
    
    titleGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.3)`);
    titleGradient.addColorStop(1, `rgba(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)}, 0.3)`);
  } else {
    titleGradient.addColorStop(0, 'rgba(255, 107, 157, 0.3)');    // ピンク
    titleGradient.addColorStop(1, 'rgba(120, 111, 166, 0.3)');    // 紫
  }
  
  ctx.fillStyle = titleGradient;
  ctx.fillRect(titleBgX, titleBgY, titleBgWidth, titleBgHeight);
  
  // タイトルの縁取り効果
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.lineWidth = 1;
  ctx.strokeText(titleText, width / 2, 5);
  
  // タイトル本体
  ctx.fillStyle = '#fff';
  ctx.fillText(titleText, width / 2, 5);
  
  // タイトル周りの装飾線（左右）
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(8, 9);
  ctx.lineTo(titleBgX - 4, 9);
  ctx.moveTo(titleBgX + titleBgWidth + 4, 9);
  ctx.lineTo(width - 8, 9);
  ctx.stroke();
  
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
  
  // 募集内容用の枠（下のスペースを拡張）
  const boxX = 8;
  const boxY = height * 0.39; // 41%から39%に上移動
  const boxWidth = width * 0.48; // 画像幅の48%
  const boxHeight = height * 0.50; // 45%から50%に拡張（下のスペースを増加）
  
  // 上側のピンのみ配置（上端の適切な位置に配置）
  drawPin(8, 8, 'rgba(255, 71, 87, 0.7)');   // 左上 - 淡い赤（端っこに配置）
  drawPin(width - 8, 8, 'rgba(46, 213, 115, 0.7)');   // 右上 - 淡い緑（端っこに配置）
  
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
  
  // 背景と馴染む半透明ボックス（角丸）
  ctx.fillStyle = 'rgba(20, 20, 26, 0.78)';
  drawRoundedRect(boxX, boxY, boxWidth, boxHeight, 6, true, false);
  
  // 白い枠線のみ（角丸）
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 1;
  drawRoundedRect(boxX, boxY, boxWidth, boxHeight, 6, false, true);
  
  // 参加者円の描画（2列表示で最大16人対応）
  const maxMembers = Number(recruitData.maxMembers || recruitData.participants || recruitData.participantsCount || 0) || 4;
  const participantCount = Math.min(maxMembers, 16); // 最大16人に制限
  
  // 参加者数に応じてアバターサイズを動的調整
  const is2Rows = participantCount > 8;
  const circleRadius = is2Rows ? 4.0 : 6.5; // 9人以上: 3.25pxから4.0pxに拡大
  const circleSpacing = is2Rows ? 11 : 16; // 9人以上の間隔も少し広く
  const rowSpacing = is2Rows ? 10 : 15; // 9人以上の行間も少し広く
  const participantAreaY = is2Rows ? boxY - 18 : boxY - 14; // 9人以上を少し下に移動（-22から-18）
  const participantAreaX = boxX + 5;
  const maxPerRow = 8; // 1行あたりの最大人数
  
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
      ctx.font = `${is2Rows ? '5px' : '8px'} Arial`; // サイズを調整（4pxから5pxに）
      ctx.textAlign = 'center';
      ctx.fillText('?', x, y + (is2Rows ? 2 : 3));
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
      ctx.font = `${is2Rows ? '6px' : '8px'} Arial`; // サイズを動的調整
      ctx.textAlign = 'center';
      ctx.fillText('?', x, y + (is2Rows ? 2 : 3));
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
  
  // 各参加者円を描画（2列表示）
  for (let i = 0; i < participantCount; i++) {
    const row = Math.floor(i / maxPerRow); // 行番号（0または1）
    const col = i % maxPerRow; // 列番号（0-7）
    const circleX = participantAreaX + col * circleSpacing;
    const circleY = participantAreaY + row * rowSpacing;
    
    if (i < participantIds.length) {
      // 参加者がいる場合はアバターを描画
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
      
      // +マーク（サイズを動的調整）
      const plusSize = is2Rows ? 2.5 : 4; // 9人以上の場合も少し大きく
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(circleX - plusSize, circleY);
      ctx.lineTo(circleX + plusSize, circleY);
      ctx.moveTo(circleX, circleY - plusSize);
      ctx.lineTo(circleX, circleY + plusSize);
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
  const content = recruitData.description || recruitData.content || 'ガチエリア / 初心者歓迎';
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
  
  // 右上から縦に並べて表示（タイトル以外を下にずらして配置）
  const rightX = width - 54; // 右上の位置（56から54に左移動で余裕を持たせる）
  const startY = 36; // タイトル以外を下にずらす（32から36に移動）
  const itemSpacing = 20; // 各項目の間隔（19から20に拡大）
  const infoBoxWidth = 48; // 各情報ボックスの幅（50から48に縮小）
  const infoBoxHeight = 15; // 各情報ボックスの高さ
  
  // 情報配列
  const currentMembers = Array.isArray(participantIds) ? participantIds.length : Number(recruitData.currentMembers) || 0;
  const maxMembers = Number(recruitData.maxMembers || recruitData.participants || recruitData.participantsCount || recruitData.max_members || currentMembers || 0) || currentMembers || 4;

  const infoItems = [
    { label: '人数：', value: `${currentMembers}/${maxMembers}人` },
    { 
      label: '時間：', 
      value: recruitData.startTime ? `${recruitData.startTime}~` : '指定なし' 
    },
    { 
      label: '通話：', 
      value: (() => {
        // 通話有無の判定
        const hasVoice = recruitData.vc === 'あり' || recruitData.vc === true;
        const noVoice = recruitData.vc === 'なし' || recruitData.vc === false;
        
        if (hasVoice) {
          // 通話ありの場合、チャンネル名があれば表示
          if (recruitData.voiceChannelName) {
            return `あり/${recruitData.voiceChannelName}`;
          } else if (recruitData.voicePlace) {
            return `あり/${recruitData.voicePlace}`;
          }
          return 'あり';
        } else if (noVoice) {
          return 'なし';
        }
        // 指定なしの場合
        return '指定なし';
      })()
    }
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
    // テキストが長すぎる場合は省略（新しいボックス幅に対応）
    const maxWidth = infoBoxWidth - 23; // ラベル分を除いた幅（25から23に調整）
    if (ctx.measureText(value).width > maxWidth) {
      while (ctx.measureText(value + '...').width > maxWidth && value.length > 1) {
        value = value.substring(0, value.length - 1);
      }
      value += '...';
    }
    ctx.fillText(value, rightX + 20, itemY + 6); // 22から20に左移動
  });

  // 紙が少し浮いているような影効果
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  // PNG圧縮レベルを最低に設定（高画質優先）
  // compressionLevel: 0 = 圧縮なし（最高画質）、9 = 最大圧縮（最低画質）
  return canvas.toBuffer('image/png', { compressionLevel: 3, filters: canvas.PNG_FILTER_NONE });
}

module.exports = { generateRecruitCard };