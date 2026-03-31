'use client';

import { useEffect, useRef, useState } from 'react';
import Konva from 'konva';

type LayoutField = { x: number; y: number; size: number; visible: boolean };
type LayoutBox = { x: number; y: number; width: number; height: number; visible: boolean };

interface RecruitCardCanvasProps {
  recruitData: {
    title: string;
    content: string;
    participants: number;
    startTimeText: string;
    voicePlace: string;
  };
  layout: {
    canvas: { width: number; height: number };
    title: LayoutField;
    members: LayoutField;
    time: LayoutField;
    content: LayoutField;
    voice: LayoutField;
    contentBox: LayoutBox;
    imageBox: LayoutBox;
    participantsBox?: LayoutBox;
  };
  accentColor?: string;
  textColor?: string;
  backgroundImageUrl?: string;
  scale?: number;
  onLayoutChange?: (field: string, x: number, y: number) => void;
  onRenderedDataUrl?: (dataUrl: string) => void;
}

const DEFAULT_ACCENT_COLOR = 'FF6B9D';
const RECT_CANVAS_WIDTH = 160;
const RECT_CANVAS_HEIGHT = 90;
const DEFAULT_LAYOUT = {
  canvas: { width: 1280, height: 720 },
  title: { x: 420, y: 36, size: 64, visible: true },
  members: { x: 969, y: 302, size: 24, visible: true },
  time: { x: 969, y: 446, size: 24, visible: true },
  content: { x: 110, y: 389, size: 24, visible: true },
  voice: { x: 969, y: 590, size: 24, visible: true },
  contentBox: { x: 73, y: 281, width: 614, height: 360, visible: true },
  imageBox: { x: 880, y: 330, width: 300, height: 220, visible: false },
  participantsBox: { x: 119, y: 180, width: 1134, height: 158, visible: true },
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '').padEnd(6, '0').slice(0, 6);
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return { r, g, b };
}

function normalizeHexColor(hex?: string, fallback = '#FFFFFF') {
  const raw = String(hex || '').trim();
  if (!raw) return fallback;
  const normalized = raw.startsWith('#') ? raw : `#${raw}`;
  if (!/^#[0-9A-Fa-f]{6}$/.test(normalized)) return fallback;
  return normalized;
}

function truncateTextByWidth(text: string, maxWidth: number, measure: (t: string) => number) {
  let result = text;
  if (measure(result) <= maxWidth) return result;
  while (result.length > 1 && measure(`${result}...`) > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}...`;
}

function wrapTextLines(text: string, maxWidth: number, measure: (t: string) => number) {
  const lines: string[] = [];
  text.split(/\r?\n/).forEach((rawLine) => {
    let line = '';
    for (const char of rawLine) {
      if (measure(line + char) > maxWidth) {
        lines.push(line);
        line = '';
      }
      line += char;
    }
    if (line) lines.push(line);
  });
  return lines;
}

function createMeasure(fontSize: number, bold = false) {
  const t = new Konva.Text({
    text: '',
    fontSize,
    fontFamily: 'CorporateRounded',
    fontStyle: bold ? 'bold' : 'normal',
  });
  return (text: string) => {
    t.text(text);
    return t.width();
  };
}

function addGradientBorder(layer: Konva.Layer, width: number, height: number, accentColor: string) {
  const { r, g, b } = hexToRgb(accentColor);
  const light = `rgb(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)})`;
  const base = `#${accentColor}`;
  const dark = `rgb(${Math.max(0, r - 40)}, ${Math.max(0, g - 40)}, ${Math.max(0, b - 40)})`;

  layer.add(
    new Konva.Rect({
      // node-canvas の strokeRect(0,0,w,h), lineWidth=5 相当を可視領域内で再現
      x: 2.5,
      y: 2.5,
      width: Math.max(1, width - 5),
      height: Math.max(1, height - 5),
      strokeWidth: 5,
      strokeLinearGradientStartPoint: { x: 0, y: 0 },
      strokeLinearGradientEndPoint: { x: width, y: height },
      strokeLinearGradientColorStops: [0, light, 0.5, base, 1, dark],
      fillEnabled: false,
    })
  );
}

function drawPin(layer: Konva.Layer, x: number, y: number, color: string) {
  layer.add(new Konva.Circle({ x: x + 1, y: y + 1, radius: 3, fill: 'rgba(0,0,0,0.15)' }));
  layer.add(new Konva.Circle({ x, y, radius: 3, fill: color }));
  layer.add(new Konva.Circle({ x: x - 0.5, y: y - 0.5, radius: 1, fill: 'rgba(255,255,255,0.4)' }));
}

function addRectStyleTitle(layer: Konva.Layer, width: number, title: string, accentColor: string, textColor: string) {
  const measure = createMeasure(8, true);
  const titleText = truncateTextByWidth(title || '募集タイトル', width - 16, measure);
  const textWidth = measure(titleText);
  const bgX = (width - textWidth) / 2 - 6;
  const bgY = 3;
  const bgW = textWidth + 12;
  const bgH = 12;
  const { r, g, b } = hexToRgb(accentColor);

  layer.add(
    new Konva.Rect({
      x: bgX,
      y: bgY,
      width: bgW,
      height: bgH,
      fillLinearGradientStartPoint: { x: bgX, y: bgY },
      fillLinearGradientEndPoint: { x: bgX + bgW, y: bgY + bgH },
      fillLinearGradientColorStops: [
        0,
        `rgba(${r}, ${g}, ${b}, 0.3)`,
        1,
        `rgba(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)}, 0.3)`,
      ],
    })
  );

  layer.add(
    new Konva.Text({
      x: 0,
      y: 5,
      width,
      text: titleText,
      align: 'center',
      fill: textColor,
      stroke: 'rgba(0, 0, 0, 0.5)',
      strokeWidth: 1,
      fontSize: 8,
      fontStyle: 'bold',
      fontFamily: 'CorporateRounded, Arial, sans-serif',
    })
  );

  drawPin(layer, 8, 8, 'rgba(46, 213, 115, 0.7)');
  drawPin(layer, width - 8, 8, 'rgba(255, 71, 87, 0.7)');
}

function addTemplateTextNode(
  layer: Konva.Layer,
  field: LayoutField,
  text: string,
  textColor: string,
  draggable: boolean,
  onDragEnd?: (x: number, y: number) => void
) {
  if (!field.visible || !text) return;

  const sizePx = Math.max(4, field.size);
  const measure = createMeasure(sizePx, true);
  const textWidth = Math.ceil(measure(text));
  const textPaddingX = Math.max(8, Math.round(sizePx * 0.25));
  const textPaddingY = Math.max(4, Math.round(sizePx * 0.2));
  const rectWidth = textWidth + textPaddingX * 2;
  const rectHeight = sizePx + textPaddingY * 2;
  const radius = Math.max(6, Math.round(sizePx * 0.2));

  const group = new Konva.Group({ x: field.x, y: field.y, draggable });
  group.add(new Konva.Rect({ x: 0, y: 0, width: rectWidth, height: rectHeight, cornerRadius: radius, fill: 'rgba(0,0,0,0.45)' }));
  group.add(
    new Konva.Rect({
      x: 0,
      y: 0,
      width: rectWidth,
      height: rectHeight,
      cornerRadius: radius,
      stroke: 'rgba(255,255,255,0.25)',
      strokeWidth: 1,
    })
  );
  group.add(
    new Konva.Text({
      x: textPaddingX,
      y: textPaddingY,
      text,
      fill: textColor,
      fontSize: sizePx,
      fontStyle: 'bold',
      fontFamily: 'CorporateRounded',
    })
  );

  if (onDragEnd) {
    group.on('dragend', () => onDragEnd(Math.round(group.x()), Math.round(group.y())));
  }

  layer.add(group);
}

function addTemplateContentNode(
  layer: Konva.Layer,
  field: LayoutField,
  contentBox: LayoutBox,
  text: string,
  textColor: string,
  draggable: boolean,
  onDragEnd?: (x: number, y: number) => void
) {
  if (!field.visible) return;

  const sizePx = Math.max(4, field.size);
  const lineHeight = Math.round(sizePx * 1.25);
  const measure = createMeasure(sizePx, false);
  const maxWidth = Math.max(120, contentBox.visible ? contentBox.width - 24 : RECT_CANVAS_WIDTH * 0.66);
  const lines = wrapTextLines(text || '募集内容を入力', maxWidth, measure).slice(0, 6);
  const maxTextWidth = Math.min(maxWidth, Math.max(...lines.map((line) => Math.ceil(measure(line))), 40));

  const textPaddingX = Math.max(8, Math.round(sizePx * 0.25));
  const textPaddingY = Math.max(4, Math.round(sizePx * 0.2));
  const rectX = contentBox.visible ? contentBox.x : field.x;
  const rectY = contentBox.visible ? contentBox.y : field.y;
  const rectWidth = contentBox.visible ? contentBox.width : maxTextWidth + textPaddingX * 2;
  const rectHeight = contentBox.visible ? contentBox.height : lineHeight * lines.length + textPaddingY * 2;
  const radius = Math.max(6, Math.round(sizePx * 0.2));

  const group = new Konva.Group({ x: 0, y: 0, draggable });
  group.add(new Konva.Rect({ x: rectX, y: rectY, width: rectWidth, height: rectHeight, cornerRadius: radius, fill: 'rgba(0,0,0,0.45)' }));
  group.add(new Konva.Rect({ x: rectX, y: rectY, width: rectWidth, height: rectHeight, cornerRadius: radius, stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1 }));

  const startX = contentBox.visible ? rectX + 12 : field.x + textPaddingX;
  const startY = contentBox.visible ? rectY + 12 : field.y + textPaddingY;
  const maxLines = contentBox.visible ? Math.max(1, Math.floor((rectHeight - 24) / lineHeight)) : lines.length;
  lines.slice(0, maxLines).forEach((line, i) => {
    group.add(new Konva.Text({ x: startX, y: startY + i * lineHeight, text: line, fill: textColor, fontSize: sizePx, fontFamily: 'CorporateRounded' }));
  });

  if (onDragEnd) {
    const baseX = contentBox.visible ? contentBox.x : field.x;
    const baseY = contentBox.visible ? contentBox.y : field.y;
    group.on('dragend', () => onDragEnd(Math.round(baseX + group.x()), Math.round(baseY + group.y())));
  }
  layer.add(group);
}

function drawEmptyParticipantSlot(target: Konva.Layer | Konva.Group, x: number, y: number, radius: number, plusSize: number) {
  target.add(new Konva.Circle({ x, y, radius, fill: '#333', stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1 }));
  target.add(new Konva.Line({ points: [x - plusSize, y, x + plusSize, y], stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1 }));
  target.add(new Konva.Line({ points: [x, y - plusSize, x, y + plusSize], stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1 }));
}

function scaleTextFieldToRect(field: LayoutField, layoutCanvas: { width: number; height: number }): LayoutField {
  const sx = RECT_CANVAS_WIDTH / (layoutCanvas.width || DEFAULT_LAYOUT.canvas.width);
  const sy = RECT_CANVAS_HEIGHT / (layoutCanvas.height || DEFAULT_LAYOUT.canvas.height);
  return {
    x: Math.round(field.x * sx),
    y: Math.round(field.y * sy),
    size: Math.max(4, Math.round(field.size * ((sx + sy) / 2))),
    visible: field.visible,
  };
}

function scaleBoxToRect(box: LayoutBox, layoutCanvas: { width: number; height: number }): LayoutBox {
  const sx = RECT_CANVAS_WIDTH / (layoutCanvas.width || DEFAULT_LAYOUT.canvas.width);
  const sy = RECT_CANVAS_HEIGHT / (layoutCanvas.height || DEFAULT_LAYOUT.canvas.height);
  return {
    x: Math.round(box.x * sx),
    y: Math.round(box.y * sy),
    width: Math.max(16, Math.round(box.width * sx)),
    height: Math.max(16, Math.round(box.height * sy)),
    visible: box.visible,
  };
}

export function RecruitCardCanvasImpl({
  recruitData,
  layout,
  accentColor = DEFAULT_ACCENT_COLOR,
  textColor = '#FFFFFF',
  backgroundImageUrl,
  scale = 1,
  onLayoutChange,
  onRenderedDataUrl,
}: RecruitCardCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const { width: canvasWidth, height: canvasHeight } = layout.canvas;
  const [containerSize, setContainerSize] = useState({ width: RECT_CANVAS_WIDTH, height: RECT_CANVAS_HEIGHT });
  const resolvedTextColor = normalizeHexColor(textColor, '#FFFFFF');
  
  // コールバック参照の安定化（依存配列から除外するため）
  const onLayoutChangeRef = useRef(onLayoutChange);
  const onRenderedDataUrlRef = useRef(onRenderedDataUrl);
  
  useEffect(() => {
    onLayoutChangeRef.current = onLayoutChange;
    onRenderedDataUrlRef.current = onRenderedDataUrl;
  }, [onLayoutChange, onRenderedDataUrl]);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateContainerSize = () => {
      const width = containerRef.current?.clientWidth ?? canvasWidth;
      const height = containerRef.current?.clientHeight ?? canvasHeight;
      setContainerSize({ width, height });
    };

    updateContainerSize();

    const observer = new ResizeObserver(() => updateContainerSize());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [canvasWidth, canvasHeight]);

  useEffect(() => {
    if (!containerRef.current) return;

    const stage = new Konva.Stage({
      container: containerRef.current,
      width: containerSize.width,
      height: containerSize.height,
    });
    stageRef.current = stage;

    const baseFitScale = Math.min(
      containerSize.width / RECT_CANVAS_WIDTH,
      containerSize.height / RECT_CANVAS_HEIGHT
    );
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const effectiveScale = baseFitScale * safeScale;
    const offsetX = (containerSize.width - RECT_CANVAS_WIDTH * effectiveScale) / 2;
    const offsetY = (containerSize.height - RECT_CANVAS_HEIGHT * effectiveScale) / 2;

    const sx = RECT_CANVAS_WIDTH / (canvasWidth || DEFAULT_LAYOUT.canvas.width);
    const sy = RECT_CANVAS_HEIGHT / (canvasHeight || DEFAULT_LAYOUT.canvas.height);
    const toEditorX = (x: number) => Math.round(x / sx);
    const toEditorY = (y: number) => Math.round(y / sy);

    const layer = new Konva.Layer({
      x: offsetX,
      y: offsetY,
      scaleX: effectiveScale,
      scaleY: effectiveScale,
    });
    stage.add(layer);

    const participants = clamp(Number(recruitData.participants || 4), 0, 16);
    const voiceText = recruitData.voicePlace || '指定なし';
    
    const scaledImageBox = scaleBoxToRect(layout.imageBox, layout.canvas);
    const scaledContentBox = scaleBoxToRect(layout.contentBox, layout.canvas);
    const scaledParticipantsBox = scaleBoxToRect(
      layout.participantsBox || DEFAULT_LAYOUT.participantsBox,
      layout.canvas
    );
    const scaledTitle = scaleTextFieldToRect(layout.title, layout.canvas);
    const scaledMembers = scaleTextFieldToRect(layout.members, layout.canvas);
    const scaledTime = scaleTextFieldToRect(layout.time, layout.canvas);
    const scaledVoice = scaleTextFieldToRect(layout.voice, layout.canvas);
    const scaledContent = scaleTextFieldToRect(layout.content, layout.canvas);

    const drawAsync = async () => {
      // 背景は透明（fillなし）
      addGradientBorder(layer, RECT_CANVAS_WIDTH, RECT_CANVAS_HEIGHT, accentColor);

      addRectStyleTitle(layer, RECT_CANVAS_WIDTH, recruitData.title || '募集タイトル', accentColor, resolvedTextColor);

      const contentGroup = new Konva.Group({
        x: scaledContentBox.x,
        y: scaledContentBox.y,
        draggable: Boolean(onLayoutChangeRef.current),
      });
      if (onLayoutChangeRef.current) {
        contentGroup.on('dragend', () => {
          onLayoutChangeRef.current?.('contentBox', toEditorX(contentGroup.x()), toEditorY(contentGroup.y()));
        });
      }

      contentGroup.add(new Konva.Rect({
        x: 0,
        y: 0,
        width: scaledContentBox.width,
        height: scaledContentBox.height,
        cornerRadius: 6,
        fill: 'rgba(0,0,0,0.75)',
        stroke: 'rgba(255,255,255,0.6)',
        strokeWidth: 1,
      }));
      contentGroup.add(new Konva.Text({
        x: 4,
        y: 3,
        text: '募集内容',
        fill: 'rgba(255,255,255,0.8)',
        fontSize: 6,
        fontStyle: 'bold',
        fontFamily: 'CorporateRounded, Arial, sans-serif',
      }));

      const contentLines = wrapTextLines(recruitData.content || 'ガチエリア / 初心者歓迎', scaledContentBox.width - 16, createMeasure(4));
      contentLines.slice(0, Math.floor((scaledContentBox.height - 20) / 6)).forEach((line, i) => {
        contentGroup.add(new Konva.Text({
          x: 4,
          y: 15 + i * 6,
          text: line,
          fill: resolvedTextColor,
          fontSize: 4,
          fontFamily: 'CorporateRounded, Arial, sans-serif',
        }));
      });
      layer.add(contentGroup);

      if (scaledParticipantsBox.visible) {
        const participantsGroup = new Konva.Group({
          x: scaledParticipantsBox.x,
          y: scaledParticipantsBox.y,
          draggable: Boolean(onLayoutChangeRef.current),
        });
        if (onLayoutChangeRef.current) {
          participantsGroup.on('dragend', () => {
            onLayoutChangeRef.current?.('participantsBox', toEditorX(participantsGroup.x()), toEditorY(participantsGroup.y()));
          });
        }

        const participantSlots = Math.min(Math.max(participants, 1), 16);
        const is2Rows = participantSlots > 8;
        const circleRadius = is2Rows ? 4 : 6.5;
        const circleSpacing = is2Rows ? 11 : 16;
        const rowSpacing = is2Rows ? 10 : 15;
        for (let i = 0; i < participantSlots; i++) {
          const row = Math.floor(i / 8);
          const col = i % 8;
          drawEmptyParticipantSlot(
            participantsGroup,
            circleRadius + col * circleSpacing,
            circleRadius + row * rowSpacing,
            circleRadius,
            is2Rows ? 2.5 : 4
          );
        }
        layer.add(participantsGroup);
      }

      const infoItems = [
        { key: 'members', x: scaledMembers.x, y: scaledMembers.y, label: '人数：', value: `${Math.min(1, participants)}/${participants}人` },
        { key: 'time', x: scaledTime.x, y: scaledTime.y, label: '時間：', value: `${recruitData.startTimeText || '今から'}~` },
        { key: 'voice', x: scaledVoice.x, y: scaledVoice.y, label: '通話：', value: voiceText },
      ];

      infoItems.forEach((item) => {
        const infoGroup = new Konva.Group({ x: item.x, y: item.y, draggable: Boolean(onLayoutChangeRef.current) });
        if (onLayoutChangeRef.current) {
          infoGroup.on('dragend', () => {
            onLayoutChangeRef.current?.(item.key, toEditorX(infoGroup.x()), toEditorY(infoGroup.y()));
          });
        }
        infoGroup.add(new Konva.Rect({ x: 0, y: 0, width: 48, height: 15, cornerRadius: 3, fill: 'rgba(0,0,0,0.75)', stroke: 'rgba(255,255,255,0.6)', strokeWidth: 0.5 }));
        infoGroup.add(new Konva.Text({ x: 3, y: 6, text: item.label, fill: 'rgba(255,255,255,0.75)', fontSize: 4, fontStyle: 'bold', fontFamily: 'CorporateRounded, Arial, sans-serif' }));
        infoGroup.add(new Konva.Text({ x: 20, y: 6, text: truncateTextByWidth(item.value, 25, createMeasure(4)), fill: resolvedTextColor, fontSize: 4, fontFamily: 'CorporateRounded, Arial, sans-serif' }));
        layer.add(infoGroup);
      });

      if (scaledImageBox.visible && backgroundImageUrl) {
        try {
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new window.Image();
            i.crossOrigin = 'anonymous';
            i.onload = () => resolve(i);
            i.onerror = reject;
            i.src = backgroundImageUrl;
          });

          // ステッカー画像は枠なしでそのまま貼り付ける
          const imageNode = new Konva.Image({
            x: scaledImageBox.x,
            y: scaledImageBox.y,
            width: scaledImageBox.width,
            height: scaledImageBox.height,
            image: img,
            draggable: Boolean(onLayoutChangeRef.current),
            dragBoundFunc: (pos) => pos,
          });
          if (onLayoutChangeRef.current) {
            imageNode.on('dragend', () => {
              if (onLayoutChangeRef.current) {
                onLayoutChangeRef.current('imageBox', toEditorX(imageNode.x()), toEditorY(imageNode.y()));
              }
            });
          }
          layer.add(imageNode);
        } catch {
          // keep placeholder when image load fails
        }
      }


      layer.draw();

      if (onRenderedDataUrlRef.current) {
        onRenderedDataUrlRef.current(stage.toDataURL({ pixelRatio: 1 }));
      }
    };

    void drawAsync();

    return () => {
      stage.destroy();
    };
  }, [recruitData, layout, accentColor, textColor, resolvedTextColor, backgroundImageUrl, scale, canvasWidth, canvasHeight, containerSize]);

  return (
    <div className="w-full bg-gray-950 overflow-hidden" style={{ aspectRatio: `${layout.canvas.width} / ${layout.canvas.height}` }}>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
