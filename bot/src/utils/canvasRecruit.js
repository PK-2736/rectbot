// Canvas画像生成用ユーティリティ
const { createCanvas, registerFont, loadImage } = require('canvas');
registerFont(__dirname + '/../../data/Corporate-Logo-Rounded-Bold-ver3.otf', { family: 'CorporateRounded' });

function truncateText(ctx, text, maxWidth) {
  let result = text;
  if (ctx.measureText(result).width > maxWidth) {
    while (ctx.measureText(result + '...').width > maxWidth && result.length > 1) {
      result = result.substring(0, result.length - 1);
    }
    result += '...';
  }
  return result;
}

function createBorderGradient(ctx, width, height, accentColor) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);

  if (accentColor) {
    const baseColor = `#${accentColor}`;
    const r = parseInt(accentColor.substr(0, 2), 16);
    const g = parseInt(accentColor.substr(2, 2), 16);
    const b = parseInt(accentColor.substr(4, 2), 16);

    const lightR = Math.min(255, r + 40);
    const lightG = Math.min(255, g + 40);
    const lightB = Math.min(255, b + 40);

    const darkR = Math.max(0, r - 40);
    const darkG = Math.max(0, g - 40);
    const darkB = Math.max(0, b - 40);

    gradient.addColorStop(0, `rgb(${lightR}, ${lightG}, ${lightB})`);
    gradient.addColorStop(0.5, baseColor);
    gradient.addColorStop(1, `rgb(${darkR}, ${darkG}, ${darkB})`);
  } else {
    gradient.addColorStop(0, '#ff6b9d');
    gradient.addColorStop(0.3, '#c44569');
    gradient.addColorStop(0.7, '#786fa6');
    gradient.addColorStop(1, '#4834d4');
  }

  return gradient;
}

function createTitleGradient(ctx, x, y, width, height, accentColor) {
  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);

  if (accentColor) {
    const r = parseInt(accentColor.substr(0, 2), 16);
    const g = parseInt(accentColor.substr(2, 2), 16);
    const b = parseInt(accentColor.substr(4, 2), 16);

    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.3)`);
    gradient.addColorStop(1, `rgba(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)}, 0.3)`);
  } else {
    gradient.addColorStop(0, 'rgba(255, 107, 157, 0.3)');
    gradient.addColorStop(1, 'rgba(120, 111, 166, 0.3)');
  }

  return gradient;
}

function drawRoundedRect(ctx, x, y, width, height, radius, fill = true, stroke = false) {
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

function drawPin(ctx, x, y, color) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.beginPath();
  ctx.arc(x + 1, y + 1, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.beginPath();
  ctx.arc(x - 0.5, y - 0.5, 1, 0, Math.PI * 2);
  ctx.fill();
}

function getRawMaxMembers(recruitData) {
  return recruitData.maxMembers
    ?? recruitData.metadata?.raw?.maxMembers
    ?? recruitData.metadata?.raw?.participants
    ?? recruitData.raw?.maxMembers
    ?? recruitData.raw?.participants
    ?? recruitData.participantsCount
    ?? recruitData.max_members
    ?? null;
}

function getCurrentMembers(recruitData, participantIds) {
  return Array.isArray(participantIds)
    ? participantIds.length
    : Number(recruitData.currentMembers || recruitData.participantsCount || 0) || 0;
}

function getMaxMembers(recruitData, currentMembers) {
  const rawMax = getRawMaxMembers(recruitData);
  return Number(rawMax) || Math.max(currentMembers, 4);
}

function getParticipantCount(currentMembers, maxMembers) {
  return Math.min(Math.max(currentMembers, maxMembers), 16);
}

function getParticipantLayout(participantCount, boxX, boxY) {
  const is2Rows = participantCount > 8;
  return {
    is2Rows,
    circleRadius: is2Rows ? 4.0 : 6.5,
    circleSpacing: is2Rows ? 11 : 16,
    rowSpacing: is2Rows ? 10 : 15,
    participantAreaY: is2Rows ? boxY - 18 : boxY - 14,
    participantAreaX: boxX + 5,
    maxPerRow: 8
  };
}

function drawFallbackAvatar(ctx, x, y, circleRadius, is2Rows, fontSize) {
  ctx.fillStyle = '#5865F2';
  ctx.beginPath();
  ctx.arc(x, y, circleRadius, 0, 2 * Math.PI);
  ctx.fill();

  ctx.fillStyle = 'white';
  ctx.font = `${is2Rows ? fontSize : 8}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('?', x, y + (is2Rows ? 2 : 3));
}

async function drawParticipantAvatar(ctx, x, y, userId, options) {
  const { circleRadius, is2Rows, client } = options;

  if (!userId || userId === 'null' || userId === null || userId === undefined) {
    console.error(`Invalid userId provided: ${userId}`);
    drawFallbackAvatar(ctx, x, y, circleRadius, is2Rows, 5);
    return;
  }

  try {
    const user = await client.users.fetch(userId);
    const avatarURL = user.displayAvatarURL({ extension: 'png', size: 128 });
    const avatar = await loadImage(avatarURL);

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, circleRadius, 0, 2 * Math.PI);
    ctx.clip();
    ctx.drawImage(avatar, x - circleRadius, y - circleRadius, circleRadius * 2, circleRadius * 2);
    ctx.restore();
  } catch (error) {
    console.error(`Failed to load avatar for user ${userId}:`, error);
    drawFallbackAvatar(ctx, x, y, circleRadius, is2Rows, 6);
  }
}

function wrapTextLines(ctx, text, maxWidth) {
  const lines = [];

  text.split(/\r?\n/).forEach(rawLine => {
    let line = '';
    for (const char of rawLine) {
      if (ctx.measureText(line + char).width > maxWidth) {
        lines.push(line);
        line = '';
      }
      line += char;
    }
    if (line) lines.push(line);
  });

  return lines;
}

function formatVoiceInfo(recruitData) {
  const vcValue = recruitData.vc || recruitData.voice;

  if (typeof vcValue === 'string') {
    const vcLower = vcValue.toLowerCase();
    if (vcLower.includes('なし')) {
      return 'なし';
    } else if (vcLower.includes('聞き専')) {
      if (recruitData.voiceChannelName) {
        return `あり(聞き専)/${recruitData.voiceChannelName}`;
      } else if (recruitData.voicePlace) {
        return `あり(聞き専)/${recruitData.voicePlace}`;
      }
      return 'あり(聞き専)';
    } else if (vcLower.includes('あり')) {
      if (recruitData.voiceChannelName) {
        return `あり/${recruitData.voiceChannelName}`;
      } else if (recruitData.voicePlace) {
        return `あり/${recruitData.voicePlace}`;
      } else if (recruitData.metadata?.note) {
        return `あり/${recruitData.metadata.note}`;
      }
      return 'あり';
    }
  }

  if (vcValue === true) {
    if (recruitData.voiceChannelName) {
      return `あり/${recruitData.voiceChannelName}`;
    } else if (recruitData.voicePlace) {
      return `あり/${recruitData.voicePlace}`;
    } else if (recruitData.metadata?.note) {
      return `あり/${recruitData.metadata.note}`;
    }
    return 'あり';
  } else if (vcValue === false) {
    return 'なし';
  }

  return '指定なし';
}

function buildInfoItems(recruitData, participantIds) {
  const infoCurrent = getCurrentMembers(recruitData, participantIds);
  const infoMax = getMaxMembers(recruitData, infoCurrent);
  const startLabel = recruitData.metadata?.startLabel || recruitData.startTime || null;

  return [
    { label: '人数：', value: `${infoCurrent}/${infoMax}人` },
    { label: '時間：', value: startLabel ? `${startLabel}~` : '指定なし' },
    { label: '通話：', value: formatVoiceInfo(recruitData) }
  ];
}

function drawInfoItems(ctx, items, layout) {
  const { rightX, startY, itemSpacing, infoBoxWidth, infoBoxHeight } = layout;

  items.forEach((item, index) => {
    const itemY = startY + (index * itemSpacing);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    drawRoundedRect(ctx, rightX, itemY, infoBoxWidth, infoBoxHeight, 3, true, false);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 0.5;
    drawRoundedRect(ctx, rightX, itemY, infoBoxWidth, infoBoxHeight, 3, false, true);

    ctx.fillStyle = '#bbb';
    ctx.font = 'bold 4px CorporateRounded';
    ctx.fillText(item.label, rightX + 3, itemY + 6);

    ctx.fillStyle = '#fff';
    ctx.font = '4px CorporateRounded';
    const maxWidth = infoBoxWidth - 23;
    const value = truncateText(ctx, item.value, maxWidth);
    ctx.fillText(value, rightX + 20, itemY + 6);
  });
}

function setupCanvas() {
  const width = 140;
  const height = 100;
  const scale = 5;
  const canvas = createCanvas(width * scale, height * scale);
  const ctx = canvas.getContext('2d');

  ctx.textRenderingOptimization = 'optimizeQuality';
  ctx.quality = 'best';
  ctx.patternQuality = 'best';
  ctx.textDrawingMode = 'path';
  ctx.antialias = 'subpixel';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, width, height);

  return { canvas, ctx, width, height };
}

function drawBorder(ctx, width, height, accentColor) {
  ctx.strokeStyle = createBorderGradient(ctx, width, height, accentColor);
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, width, height);
}

function drawCardTitle(ctx, width, title, accentColor) {
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 8px CorporateRounded';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  
  const titleMaxWidth = width - 16;
  const titleText = truncateText(ctx, title || 'ゲーム募集', titleMaxWidth);
  const titleWidth = ctx.measureText(titleText).width;
  const titleBgX = (width - titleWidth) / 2 - 6;
  const titleBgY = 3;
  const titleBgWidth = titleWidth + 12;
  const titleBgHeight = 12;
  
  ctx.fillStyle = createTitleGradient(ctx, titleBgX, titleBgY, titleBgWidth, titleBgHeight, accentColor);
  ctx.fillRect(titleBgX, titleBgY, titleBgWidth, titleBgHeight);
  
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.lineWidth = 1;
  ctx.strokeText(titleText, width / 2, 5);
  
  ctx.fillStyle = '#fff';
  ctx.fillText(titleText, width / 2, 5);
  
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(14, 9);
  ctx.lineTo(titleBgX - 4, 9);
  ctx.moveTo(titleBgX + titleBgWidth + 4, 9);
  ctx.lineTo(width - 14, 9);
  ctx.stroke();
  
  ctx.textAlign = 'start';
  ctx.textBaseline = 'top';

  drawPin(ctx, 8, 8, 'rgba(46, 213, 115, 0.7)');
  drawPin(ctx, width - 8, 8, 'rgba(255, 71, 87, 0.7)');
}

function drawContentBoxBackground(ctx, boxX, boxY, boxWidth, boxHeight) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 6, true, false);
  
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 6, false, true);
}

function drawEmptyParticipantSlot(ctx, x, y, circleRadius, is2Rows) {
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
  ctx.stroke();
  
  const plusSize = is2Rows ? 2.5 : 4;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - plusSize, y);
  ctx.lineTo(x + plusSize, y);
  ctx.moveTo(x, y - plusSize);
  ctx.lineTo(x, y + plusSize);
  ctx.stroke();
}

async function drawParticipantCircles(ctx, participantIds, participantCount, layout, client) {
  const { participantAreaX, participantAreaY, circleSpacing, rowSpacing, circleRadius, is2Rows, maxPerRow } = layout;
  
  for (let i = 0; i < participantCount; i++) {
    const row = Math.floor(i / maxPerRow);
    const col = i % maxPerRow;
    const circleX = participantAreaX + col * circleSpacing;
    const circleY = participantAreaY + row * rowSpacing;
    
    if (i < participantIds.length) {
      await drawParticipantAvatar(ctx, circleX, circleY, participantIds[i], {
        circleRadius,
        is2Rows,
        client
      });
    } else {
      drawEmptyParticipantSlot(ctx, circleX, circleY, circleRadius, is2Rows);
    }
  }
}

function drawContentTextSection(ctx, boxX, boxY, boxWidth, boxHeight, content) {
  ctx.fillStyle = '#fff';
  ctx.font = '6px CorporateRounded';
  ctx.textBaseline = 'top';
  
  ctx.font = 'bold 6px CorporateRounded';
  ctx.fillStyle = '#bbb';
  ctx.fillText('募集内容', boxX + 4, boxY + 3);
  
  ctx.font = '4px CorporateRounded';
  ctx.fillStyle = '#fff';
  const lineHeight = 6;
  const maxLines = Math.floor((boxHeight - 20) / lineHeight);
  const wrappedLines = wrapTextLines(ctx, content || 'ガチエリア / 初心者歓迎', boxWidth - 16);
  
  for (let i = 0; i < Math.min(wrappedLines.length, maxLines); i++) {
    ctx.fillText(wrappedLines[i], boxX + 4, boxY + 15 + i * lineHeight);
  }
}

function applyShadowEffect(ctx) {
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
}

/**
 * 募集カード画像を生成（スプラ風レイアウト）
 * @param {Object} recruitData 募集内容データ
 * @param {Array} participantIds 参加者のDiscord IDリスト
 * @param {Client} client Discordクライアント
 * @returns {Buffer} PNG画像バッファ
 */
async function generateRecruitCard(recruitData, participantIds = [], client = null, accentColor = null) {
  const { canvas, ctx, width, height } = setupCanvas();
  
  drawBorder(ctx, width, height, accentColor);
  drawCardTitle(ctx, width, recruitData.title, accentColor);

  const boxX = 8;
  const boxY = height * 0.39;
  const boxWidth = width * 0.48;
  const boxHeight = height * 0.50;
  
  drawContentBoxBackground(ctx, boxX, boxY, boxWidth, boxHeight);
  
  const currentMembers = getCurrentMembers(recruitData, participantIds);
  const maxMembers = getMaxMembers(recruitData, currentMembers);
  const participantCount = getParticipantCount(currentMembers, maxMembers);
  const layout = getParticipantLayout(participantCount, boxX, boxY);
  
  await drawParticipantCircles(ctx, participantIds, participantCount, layout, client);
  
  const content = recruitData.description || recruitData.content;
  drawContentTextSection(ctx, boxX, boxY, boxWidth, boxHeight, content);
  
  const rightX = width - 54;
  const startY = 36;
  const itemSpacing = 20;
  const infoBoxWidth = 48;
  const infoBoxHeight = 15;
  
  const infoItems = buildInfoItems(recruitData, participantIds);
  drawInfoItems(ctx, infoItems, { rightX, startY, itemSpacing, infoBoxWidth, infoBoxHeight });

  applyShadowEffect(ctx);

  return canvas.toBuffer('image/png', { compressionLevel: 3, filters: canvas.PNG_FILTER_NONE });
}

function applyGrayscaleFilter(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const gray = Math.round((r + g + b) / 3);
    
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
  
  ctx.putImageData(imageData, 0, 0);
}

function drawDarkOverlay(ctx, width, height) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(0, 0, width, height);
}

function drawClosedText(ctx, width, height) {
  ctx.save();
  
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-Math.PI / 6);
  
  const fontSize = Math.floor(height / 5);
  ctx.font = `bold ${fontSize}px CorporateRounded`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;
  
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.lineWidth = fontSize / 8;
  ctx.strokeText('CLOSED', 0, 0);
  
  ctx.fillStyle = 'rgba(220, 38, 38, 0.95)';
  ctx.fillText('CLOSED', 0, 0);
  
  ctx.restore();
}

/**
 * 締め切り用の画像を生成（元の画像に「CLOSED」を斜めに表示）
 * @param {Buffer} originalImageBuffer 元の募集画像バッファ
 * @returns {Buffer} PNG画像バッファ
 */
async function generateClosedRecruitCard(originalImageBuffer) {
  try {
    const originalImage = await loadImage(originalImageBuffer);
    
    const width = originalImage.width;
    const height = originalImage.height;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(originalImage, 0, 0);

    applyGrayscaleFilter(ctx, width, height);
    drawDarkOverlay(ctx, width, height);
    drawClosedText(ctx, width, height);

    return canvas.toBuffer('image/png', { compressionLevel: 3, filters: canvas.PNG_FILTER_NONE });
  } catch (error) {
    console.error('[generateClosedRecruitCard] Error:', error);
    throw error;
  }
}

module.exports = { generateRecruitCard, generateClosedRecruitCard };
