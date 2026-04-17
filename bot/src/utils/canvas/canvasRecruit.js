// Canvas画像生成用ユーティリティ
const { createCanvas, registerFont, loadImage } = require('canvas');
registerFont(__dirname + '/../../../data/Corporate-Logo-Rounded-Bold-ver3.otf', { family: 'CorporateRounded' });

const DEFAULT_TEMPLATE_LAYOUT = {
  canvas: { width: 1280, height: 720 },
  outputWidth: 140,
  outputHeight: 100,
  outputScale: 5,
  contentLabel: '募集内容',
  membersLabel: '人数：',
  timeLabel: '時間：',
  voiceLabel: '通話：',
  title: { x: 420, y: 36, size: 64, visible: true },
  members: { x: 780, y: 302, size: 24, visible: true },
  time: { x: 780, y: 446, size: 24, visible: true },
  content: { x: 110, y: 389, size: 24, visible: true },
  voice: { x: 780, y: 590, size: 24, visible: true },
  contentBox: { x: 73, y: 281, width: 614, height: 360, visible: true },
  imageBox: { x: 880, y: 330, width: 300, height: 220, visible: false },
  membersBox: { x: 780, y: 285, width: 420, height: 90, visible: true },
  timeBox: { x: 780, y: 429, width: 420, height: 90, visible: true },
  voiceBox: { x: 780, y: 573, width: 420, height: 90, visible: true },
  participantsBox: { x: 155, y: 156, width: 1134, height: 158, visible: true },
  stickerImages: []
};

const DEFAULT_TITLE_TEXT_COLOR = '#FFFFFF';
const DEFAULT_TITLE_FONT_SIZE = 8;

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

function drawImageCover(ctx, img, x, y, width, height) {
  const imgW = img.width || 1;
  const imgH = img.height || 1;
  const imgRatio = imgW / imgH;
  const boxRatio = width / height;

  let sx = 0;
  let sy = 0;
  let sw = imgW;
  let sh = imgH;

  if (imgRatio > boxRatio) {
    sw = imgH * boxRatio;
    sx = (imgW - sw) / 2;
  } else {
    sh = imgW / boxRatio;
    sy = (imgH - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, x, y, width, height);
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
    ?? recruitData.participants
    ?? recruitData.metadata?.raw?.maxMembers
    ?? recruitData.metadata?.raw?.participants
    ?? recruitData.metadata?.participants
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

function getParticipantLayout(participantCount, boxX, boxY, boxWidth = 124, boxHeight = 16) {
  const slots = Math.max(1, Math.min(Number(participantCount) || 1, 16));
  const paddingX = 1;
  const paddingY = 1;
  const minGap = 1.2;
  const minRadius = 2.6;
  const maxRadius = 8.5;
  const shiftX = 1.5;
  const shiftY = -2.5;

  const usableWidth = Math.max(8, boxWidth - paddingX * 2);
  const usableHeight = Math.max(6, boxHeight - paddingY * 2);
  const radiusByCount = (usableWidth - minGap * (slots - 1)) / (slots * 2);
  const radiusByHeight = usableHeight / 2;
  const circleRadius = Math.max(minRadius, Math.min(maxRadius, radiusByCount, radiusByHeight));
  const circleSpacing = circleRadius * 2 + minGap;

  return {
    is2Rows: false,
    circleRadius,
    circleSpacing,
    rowSpacing: 0,
    participantAreaY: boxY + paddingY + (usableHeight / 2) + shiftY,
    participantAreaX: boxX + paddingX + circleRadius + shiftX,
    maxPerRow: 16
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
  const { circleRadius, is2Rows, client, avatarUrls } = options;

  if (!userId || userId === 'null' || userId === null || userId === undefined) {
    console.error(`Invalid userId provided: ${userId}`);
    drawFallbackAvatar(ctx, x, y, circleRadius, is2Rows, 5);
    return;
  }

  try {
    const urlFromMap = avatarUrls && avatarUrls[userId];
    let avatarURL = urlFromMap;
    if (!avatarURL && client) {
      const user = await client.users.fetch(userId);
      avatarURL = user.displayAvatarURL({ extension: 'png', size: 128 });
    }
    if (!avatarURL) {
      throw new Error('avatar_url_missing');
    }
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

function getTemplateSource(recruitData) {
  return recruitData?.template
    || recruitData?.templateData
    || recruitData?.metadata?.template
    || recruitData?.metadata?.raw?.template
    || null;
}

function toSafeLayout(layout) {
  if (!layout || typeof layout !== 'object') return null;
  const outputWidth = Number(layout.outputWidth ?? DEFAULT_TEMPLATE_LAYOUT.outputWidth);
  const outputHeight = Number(layout.outputHeight ?? DEFAULT_TEMPLATE_LAYOUT.outputHeight);
  const outputScale = Number(layout.outputScale ?? DEFAULT_TEMPLATE_LAYOUT.outputScale);
  const rawStickerImages = Array.isArray(layout.stickerImages) ? layout.stickerImages : [];
  const stickerImages = rawStickerImages
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const url = String(item.url || '').trim();
      if (!url) return null;
      const assetKey = item.assetKey == null ? null : String(item.assetKey || '').trim() || null;
      return { url, assetKey };
    })
    .filter(Boolean);

  return {
    canvas: layout.canvas || DEFAULT_TEMPLATE_LAYOUT.canvas,
    outputWidth: Number.isFinite(outputWidth) ? Math.max(64, Math.min(2048, Math.round(outputWidth))) : DEFAULT_TEMPLATE_LAYOUT.outputWidth,
    outputHeight: Number.isFinite(outputHeight) ? Math.max(64, Math.min(2048, Math.round(outputHeight))) : DEFAULT_TEMPLATE_LAYOUT.outputHeight,
    outputScale: Number.isFinite(outputScale) ? Math.max(2, Math.min(10, Math.round(outputScale))) : DEFAULT_TEMPLATE_LAYOUT.outputScale,
    contentLabel: typeof layout.contentLabel === 'string' ? layout.contentLabel : DEFAULT_TEMPLATE_LAYOUT.contentLabel,
    membersLabel: typeof layout.membersLabel === 'string' ? layout.membersLabel : DEFAULT_TEMPLATE_LAYOUT.membersLabel,
    timeLabel: typeof layout.timeLabel === 'string' ? layout.timeLabel : DEFAULT_TEMPLATE_LAYOUT.timeLabel,
    voiceLabel: typeof layout.voiceLabel === 'string' ? layout.voiceLabel : DEFAULT_TEMPLATE_LAYOUT.voiceLabel,
    title: layout.title || DEFAULT_TEMPLATE_LAYOUT.title,
    members: layout.members || DEFAULT_TEMPLATE_LAYOUT.members,
    time: layout.time || DEFAULT_TEMPLATE_LAYOUT.time,
    content: layout.content || DEFAULT_TEMPLATE_LAYOUT.content,
    voice: layout.voice || DEFAULT_TEMPLATE_LAYOUT.voice,
    contentBox: layout.contentBox || DEFAULT_TEMPLATE_LAYOUT.contentBox,
    imageBox: layout.imageBox || DEFAULT_TEMPLATE_LAYOUT.imageBox,
    membersBox: layout.membersBox || DEFAULT_TEMPLATE_LAYOUT.membersBox,
    timeBox: layout.timeBox || DEFAULT_TEMPLATE_LAYOUT.timeBox,
    voiceBox: layout.voiceBox || DEFAULT_TEMPLATE_LAYOUT.voiceBox,
    participantsBox: layout.participantsBox || DEFAULT_TEMPLATE_LAYOUT.participantsBox,
    stickerImages,
  };
}

function normalizeHexColor(value, fallback = '#FFFFFF') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const normalized = raw.startsWith('#') ? raw : `#${raw}`;
  if (!/^#[0-9A-Fa-f]{6}$/.test(normalized)) return fallback;
  return normalized;
}

function resolveClassicBorderColor(accentColor) {
  const hex = normalizeHexColor(accentColor, '#FFFFFF');
  return hex;
}

function resolveTextColor(recruitData) {
  const source = getTemplateSource(recruitData);
  const direct = source?.text_color
    || source?.textColor
    || recruitData?.text_color
    || recruitData?.textColor
    || recruitData?.metadata?.text_color
    || null;
  return normalizeHexColor(direct, '#FFFFFF');
}

function resolveTemplateLayout(recruitData) {
  const source = getTemplateSource(recruitData);
  const layout = source?.layout_json
    || source?.layout
    || recruitData?.layout_json
    || recruitData?.layout
    || recruitData?.metadata?.layout_json
    || recruitData?.metadata?.layout;

  return toSafeLayout(layout);
}

function getTemplateBackgroundUrl(recruitData) {
  const source = getTemplateSource(recruitData);
  const direct = source?.background_image_url
    || source?.backgroundImageUrl
    || recruitData?.background_image_url
    || recruitData?.backgroundImageUrl
    || recruitData?.metadata?.background_image_url
    || null;

  if (direct && /^https?:\/\//i.test(String(direct))) {
    return direct;
  }

  const assetKey = source?.background_asset_key
    || source?.backgroundAssetKey
    || recruitData?.background_asset_key
    || recruitData?.backgroundAssetKey
    || recruitData?.metadata?.background_asset_key
    || null;

  if (assetKey) {
    const base = process.env.WORKER_API_BASE_URL
      || process.env.PUBLIC_API_BASE_URL
      || process.env.BACKEND_API_URL
      || 'https://api.recrubo.net';
    const normalizedBase = String(base).replace(/\/$/, '');
    const normalizedKey = String(assetKey).replace(/^\//, '');
    return `${normalizedBase}/api/plus/assets/${normalizedKey}`;
  }

  if (direct && String(direct).startsWith('/')) {
    const base = process.env.WORKER_API_BASE_URL
      || process.env.PUBLIC_API_BASE_URL
      || process.env.BACKEND_API_URL
      || 'https://api.recrubo.net';
    const normalizedBase = String(base).replace(/\/$/, '');
    return `${normalizedBase}${direct}`;
  }

  return direct;
}

function getScaledBox(box, layout, canvasSize, fallback) {
  const baseWidth = layout.canvas?.width || DEFAULT_TEMPLATE_LAYOUT.canvas.width;
  const baseHeight = layout.canvas?.height || DEFAULT_TEMPLATE_LAYOUT.canvas.height;
  const scaleX = canvasSize.width / baseWidth;
  const scaleY = canvasSize.height / baseHeight;
  const safe = box || fallback;

  return {
    x: Math.round((safe.x || 0) * scaleX),
    y: Math.round((safe.y || 0) * scaleY),
    width: Math.max(16, Math.round((safe.width || 100) * scaleX)),
    height: Math.max(16, Math.round((safe.height || 100) * scaleY)),
    visible: safe.visible !== false
  };
}

function getScaledField(field, layout, canvasSize, fallback) {
  const baseWidth = layout.canvas?.width || DEFAULT_TEMPLATE_LAYOUT.canvas.width;
  const baseHeight = layout.canvas?.height || DEFAULT_TEMPLATE_LAYOUT.canvas.height;
  const scaleX = canvasSize.width / baseWidth;
  const scaleY = canvasSize.height / baseHeight;
  const safe = field || fallback;

  return {
    x: Math.round((safe.x || 0) * scaleX),
    y: Math.round((safe.y || 0) * scaleY),
    size: Math.max(4, Math.round((safe.size || 24) * ((scaleX + scaleY) / 2))),
    visible: safe.visible !== false
  };
}

async function drawTemplateModeCard(ctx, recruitData, layout, canvasSize, accentColor, participantIds = [], client = null, avatarUrls = null) {
  const legacyStickerUrl = getTemplateBackgroundUrl(recruitData);
  const textColor = resolveTextColor(recruitData);

  // テンプレートモードは透明背景で、埋め込み画像はステッカーとして imageBox に 重ねる。
  // 背景は透明（ctx.clearRect後の状態を保持）
  drawBorder(ctx, canvasSize.width, canvasSize.height, accentColor);

  const contentBox = getScaledBox(layout.contentBox, layout, canvasSize, DEFAULT_TEMPLATE_LAYOUT.contentBox);
  const imageBox = getScaledBox(layout.imageBox, layout, canvasSize, DEFAULT_TEMPLATE_LAYOUT.imageBox);
  const participantsBox = getScaledBox(
    layout.participantsBox || DEFAULT_TEMPLATE_LAYOUT.participantsBox,
    layout,
    canvasSize,
    DEFAULT_TEMPLATE_LAYOUT.participantsBox
  );

  const scaledMembers = getScaledField(layout.members, layout, canvasSize, DEFAULT_TEMPLATE_LAYOUT.members);
  const scaledTime = getScaledField(layout.time, layout, canvasSize, DEFAULT_TEMPLATE_LAYOUT.time);
  const scaledVoice = getScaledField(layout.voice, layout, canvasSize, DEFAULT_TEMPLATE_LAYOUT.voice);
  const scaledMembersBox = getScaledBox(layout.membersBox || DEFAULT_TEMPLATE_LAYOUT.membersBox, layout, canvasSize, DEFAULT_TEMPLATE_LAYOUT.membersBox);
  const scaledTimeBox = getScaledBox(layout.timeBox || DEFAULT_TEMPLATE_LAYOUT.timeBox, layout, canvasSize, DEFAULT_TEMPLATE_LAYOUT.timeBox);
  const scaledVoiceBox = getScaledBox(layout.voiceBox || DEFAULT_TEMPLATE_LAYOUT.voiceBox, layout, canvasSize, DEFAULT_TEMPLATE_LAYOUT.voiceBox);

  // /rect と同じタイトル描画方式に統一
  drawCardTitle(ctx, canvasSize.width, recruitData.title || '募集タイトル', accentColor);

  if (contentBox.visible) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    drawRoundedRect(ctx, contentBox.x, contentBox.y, contentBox.width, contentBox.height, 6, true, false);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, contentBox.x, contentBox.y, contentBox.width, contentBox.height, 6, false, true);
  }

  const currentMembers = getCurrentMembers(recruitData, participantIds);
  const maxMembers = getMaxMembers(recruitData, currentMembers);
  const participantCount = getParticipantCount(currentMembers, maxMembers);
  const content = recruitData.description || recruitData.content || '';

  if (participantsBox.visible) {
    const participantLayout = getParticipantLayout(
      participantCount,
      participantsBox.x,
      participantsBox.y,
      participantsBox.width,
      participantsBox.height
    );
    await drawParticipantCircles(ctx, participantIds, participantCount, participantLayout, client, avatarUrls);
  }

  drawContentTextSection(
    ctx,
    contentBox.x,
    contentBox.y,
    contentBox.width,
    contentBox.height,
    content,
    layout.contentLabel || DEFAULT_TEMPLATE_LAYOUT.contentLabel,
    textColor
  );

  const infoItems = buildInfoItems(recruitData, participantIds).map((item, index) => ({
    ...item,
    box: [scaledMembersBox, scaledTimeBox, scaledVoiceBox][index]
  }));
  drawInfoItems(ctx, infoItems, textColor);

  // 画像は「ステッカー」として最後に重ねる（複数枚対応）
  const stickerUrls = (Array.isArray(layout.stickerImages) ? layout.stickerImages : [])
    .map((item) => String(item?.url || '').trim())
    .filter(Boolean);
  if (stickerUrls.length === 0 && legacyStickerUrl) {
    stickerUrls.push(legacyStickerUrl);
  }

  if (imageBox.visible && stickerUrls.length > 0) {
    const count = stickerUrls.length;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const gap = 4;
    const cellWidth = Math.max(12, Math.floor((imageBox.width - gap * (cols - 1)) / cols));
    const cellHeight = Math.max(12, Math.floor((imageBox.height - gap * (rows - 1)) / rows));

    for (let idx = 0; idx < stickerUrls.length; idx += 1) {
      try {
        const sticker = await loadImage(stickerUrls[idx]);
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const x = imageBox.x + col * (cellWidth + gap);
        const y = imageBox.y + row * (cellHeight + gap);
        drawImageCover(ctx, sticker, x, y, cellWidth, cellHeight);
      } catch (e) {
        console.warn('[canvasRecruit] failed to load template sticker image:', e?.message || e);
      }
    }
  }

  return true;
}

function drawClassicTitle(ctx, width, title) {
  ctx.font = `bold ${DEFAULT_TITLE_FONT_SIZE}px CorporateRounded`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const titleMaxWidth = width - 16;
  const titleText = truncateText(ctx, title || 'ゲーム募集', titleMaxWidth);
  const titleWidth = ctx.measureText(titleText).width;
  const titleBgX = (width - titleWidth) / 2 - 6;
  const titleBgY = 3;
  const titleBgWidth = titleWidth + 12;
  const titleBgHeight = 12;

  ctx.fillStyle = 'rgba(240, 240, 240, 0.95)';
  ctx.fillRect(titleBgX, titleBgY, titleBgWidth, titleBgHeight);

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.lineWidth = 1;
  ctx.strokeText(titleText, width / 2, 5);

  ctx.fillStyle = DEFAULT_TITLE_TEXT_COLOR;
  ctx.fillText(titleText, width / 2, 5);

  // /rect 従来表示のタイトル左右の装飾線を復元
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

function drawClassicBorder(ctx, width, height, accentColor) {
  const borderColor = resolveClassicBorderColor(accentColor);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, width, height);
}

function drawClassicInfoItem(ctx, item, box, textColor = '#FFFFFF') {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  drawRoundedRect(ctx, box.x, box.y, box.width, box.height, 3, true, false);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 0.5;
  drawRoundedRect(ctx, box.x, box.y, box.width, box.height, 3, false, true);

  const labelText = String(item?.label || '').replace('：', ':');
  const valueText = String(item?.value || '');
  const infoFontSize = 4.5;

  ctx.fillStyle = textColor;
  ctx.font = `bold ${infoFontSize}px CorporateRounded`;
  // ラベルは省略せずそのまま表示（「人...」のような崩れを防ぐ）
  ctx.fillText(labelText, box.x + 3, box.y + 4);

  ctx.font = `bold ${infoFontSize}px CorporateRounded`;
  ctx.fillText(truncateText(ctx, valueText, box.width - 20), box.x + 20, box.y + 4);
}

async function drawClassicModeCard(ctx, recruitData, canvasSize, accentColor, participantIds = [], client = null, avatarUrls = null) {
  drawClassicBorder(ctx, canvasSize.width, canvasSize.height, accentColor);
  drawClassicTitle(ctx, canvasSize.width, recruitData.title || '募集タイトル');

  const contentBox = { x: 5, y: 36, width: 70, height: 54 };
  drawContentBoxBackground(ctx, contentBox.x, contentBox.y, contentBox.width, contentBox.height);

  const currentMembers = getCurrentMembers(recruitData, participantIds);
  const maxMembers = getMaxMembers(recruitData, currentMembers);
  const participantCount = getParticipantCount(currentMembers, maxMembers);
  const participantLayout = getParticipantLayout(participantCount, 9, 24, canvasSize.width - 18, 14);
  await drawParticipantCircles(ctx, participantIds, participantCount, participantLayout, client, avatarUrls);

  const content = recruitData.description || recruitData.content || '';
  drawContentTextSection(ctx, contentBox.x, contentBox.y, contentBox.width, contentBox.height, content);

  const infoItems = buildInfoItems(recruitData, participantIds);
  const infoBoxes = [
    { x: 84, y: 39, width: 50, height: 14 },
    { x: 84, y: 57, width: 50, height: 14 },
    { x: 84, y: 75, width: 50, height: 14 }
  ];
  for (let i = 0; i < Math.min(infoItems.length, infoBoxes.length); i++) {
    drawClassicInfoItem(ctx, infoItems[i], infoBoxes[i]);
  }

  return true;
}

function shouldUseTemplateModeForRecruit(recruitData) {
  if (recruitData?.renderMode === 'classic') return false;
  if (recruitData?.renderMode === 'template') return true;
  if (recruitData?.metadata?.forceTemplateMode === false) return false;
  if (recruitData?.metadata?.forceTemplateMode === true) return true;

  const source = getTemplateSource(recruitData);
  if (source) return true;
  if (recruitData?.templateName || recruitData?.template_data || recruitData?.templateData) return true;
  return Boolean(getTemplateBackgroundUrl(recruitData));
}

function extractVoicePlace(recruitData) {
  return recruitData.voiceChannelName ||
         recruitData.voicePlace ||
         recruitData.metadata?.note ||
         null;
}

function appendVoicePlace(baseText, voicePlace) {
  return voicePlace ? `${baseText}/${voicePlace}` : baseText;
}

function parseStringVoiceValue(vcLower, voicePlace) {
  if (vcLower.includes('なし')) {
    return 'なし';
  }

  if (vcLower.includes('聞き専')) {
    return appendVoicePlace('あり(聞き専)', voicePlace);
  }

  if (vcLower.includes('あり')) {
    return appendVoicePlace('あり', voicePlace);
  }

  return null;
}

function formatBooleanVoiceValue(vcValue, voicePlace) {
  if (vcValue === true) {
    return appendVoicePlace('あり', voicePlace);
  }

  if (vcValue === false) {
    return 'なし';
  }

  return null;
}

function formatVoiceInfo(recruitData) {
  const vcValue = recruitData.vc || recruitData.voice;
  const voicePlace = extractVoicePlace(recruitData);

  if (typeof vcValue === 'string') {
    const vcLower = vcValue.toLowerCase();
    const result = parseStringVoiceValue(vcLower, voicePlace);
    if (result) return result;
  }

  const booleanResult = formatBooleanVoiceValue(vcValue, voicePlace);
  if (booleanResult) return booleanResult;

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

function drawInfoItems(ctx, items, textColor = '#FFFFFF') {
  items.forEach((item) => {
    const box = item.box;
    if (!box?.visible) return;

    const paddingX = Math.max(4, Math.round(box.width * 0.08));
    const maxTextWidth = Math.max(12, box.width - paddingX * 2);

    const fitSingleLine = () => {
      const base = Math.max(4, Math.round(box.height * 0.34));
      for (let size = base; size >= 2; size -= 1) {
        ctx.font = `${size}px CorporateRounded`;
        const lineHeight = Math.max(3, Math.round(size * 1.15));
        if (lineHeight <= box.height - 6) {
          const gap = Math.max(2, Math.round(size * 0.4));
          const labelText = truncateText(ctx, String(item.label || ''), Math.max(6, maxTextWidth * 0.55));
          const labelWidth = Math.ceil(ctx.measureText(labelText).width);
          const valueAreaWidth = Math.max(6, maxTextWidth - labelWidth - gap);
          const valueText = truncateText(ctx, String(item.value || ''), valueAreaWidth);
          return { size, lineHeight, labelText, valueText, labelWidth, gap };
        }
      }
      ctx.font = '2px CorporateRounded';
      const gap = 2;
      const labelText = truncateText(ctx, String(item.label || ''), Math.max(6, maxTextWidth * 0.55));
      const labelWidth = Math.ceil(ctx.measureText(labelText).width);
      const valueAreaWidth = Math.max(6, maxTextWidth - labelWidth - gap);
      const valueText = truncateText(ctx, String(item.value || ''), valueAreaWidth);
      return {
        size: 2,
        lineHeight: 3,
        labelText,
        valueText,
        labelWidth,
        gap,
      };
    };

    const fitted = fitSingleLine();
    const startY = Math.round(box.y + (box.height - fitted.lineHeight) / 2);
    const valueX = box.x + paddingX + fitted.labelWidth + fitted.gap;
    const valueWidth = Math.max(6, box.x + box.width - paddingX - valueX);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    drawRoundedRect(ctx, box.x, box.y, box.width, box.height, Math.max(3, Math.round(box.height / 4)), true, false);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 0.5;
    drawRoundedRect(ctx, box.x, box.y, box.width, box.height, Math.max(3, Math.round(box.height / 4)), false, true);

    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `bold ${fitted.size}px CorporateRounded`;
    ctx.fillText(fitted.labelText, box.x + paddingX, startY);

    ctx.textAlign = 'center';
    ctx.font = `${fitted.size}px CorporateRounded`;
    ctx.fillText(fitted.valueText, valueX + valueWidth / 2, startY);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'top';
  });
}

function setupCanvas(outputScale = DEFAULT_TEMPLATE_LAYOUT.outputScale, outputWidth = DEFAULT_TEMPLATE_LAYOUT.outputWidth, outputHeight = DEFAULT_TEMPLATE_LAYOUT.outputHeight) {
  const width = Math.max(64, Math.min(2048, Math.round(Number(outputWidth) || DEFAULT_TEMPLATE_LAYOUT.outputWidth)));
  const height = Math.max(64, Math.min(2048, Math.round(Number(outputHeight) || DEFAULT_TEMPLATE_LAYOUT.outputHeight)));
  const scale = Math.max(2, Math.min(10, Math.round(Number(outputScale) || DEFAULT_TEMPLATE_LAYOUT.outputScale)));
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
  // 透明な背景として初期化（アルファチャンネルを保持）
  ctx.clearRect(0, 0, width, height);

  return { canvas, ctx, width, height };
}

function drawBorder(ctx, width, height, accentColor) {
  ctx.strokeStyle = createBorderGradient(ctx, width, height, accentColor);
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, width, height);
}

function drawCardTitle(ctx, width, title, accentColor) {
  ctx.fillStyle = DEFAULT_TITLE_TEXT_COLOR;
  ctx.font = `bold ${DEFAULT_TITLE_FONT_SIZE}px CorporateRounded`;
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

  ctx.fillStyle = DEFAULT_TITLE_TEXT_COLOR;
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

async function drawParticipantCircles(ctx, participantIds, participantCount, layout, client, avatarUrls) {
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
        client,
        avatarUrls
      });
    } else {
      drawEmptyParticipantSlot(ctx, circleX, circleY, circleRadius, is2Rows);
    }
  }
}

function drawContentTextSection(ctx, boxX, boxY, boxWidth, boxHeight, content, labelText = '募集内容', textColor = '#FFFFFF') {
  ctx.fillStyle = textColor;
  ctx.font = '6px CorporateRounded';
  ctx.textBaseline = 'top';

  ctx.font = 'bold 6px CorporateRounded';
  ctx.fillStyle = textColor;
  ctx.fillText(labelText || '募集内容', boxX + 4, boxY + 3);

  ctx.font = '4px CorporateRounded';
  ctx.fillStyle = textColor;
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
async function generateRecruitCard(recruitData, participantIds = [], client = null, accentColor = null, avatarUrls = null) {
  const templateLayout = resolveTemplateLayout(recruitData);
  const outputScale = templateLayout?.outputScale || DEFAULT_TEMPLATE_LAYOUT.outputScale;
  const outputWidth = templateLayout?.outputWidth || DEFAULT_TEMPLATE_LAYOUT.outputWidth;
  const outputHeight = templateLayout?.outputHeight || DEFAULT_TEMPLATE_LAYOUT.outputHeight;
  const { canvas, ctx, width, height } = setupCanvas(outputScale, outputWidth, outputHeight);
  const useTemplateMode = shouldUseTemplateModeForRecruit(recruitData);

  console.log('[generateRecruitCard] mode=', useTemplateMode ? 'template' : 'classic', 'renderMode=', recruitData?.renderMode || null, 'templateName=', recruitData?.templateName || null, 'hasTemplate=', Boolean(getTemplateSource(recruitData)), 'classicLabelFix=v2');

  if (useTemplateMode) {
    const effectiveLayout = templateLayout || DEFAULT_TEMPLATE_LAYOUT;
    const templateDrawn = await drawTemplateModeCard(ctx, recruitData, effectiveLayout, { width, height }, accentColor, participantIds, client, avatarUrls);
    if (!templateDrawn) {
      throw new Error('Failed to draw recruit card (template mode)');
    }
  } else {
    await drawClassicModeCard(ctx, recruitData, { width, height }, accentColor, participantIds, client, avatarUrls);
  }

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