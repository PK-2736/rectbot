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
  };
  accentColor?: string;
  backgroundImageUrl?: string;
  scale?: number;
  onLayoutChange?: (field: string, x: number, y: number) => void;
  onRenderedDataUrl?: (dataUrl: string) => void;
}

const DEFAULT_ACCENT_COLOR = 'FF6B9D';
const RECT_CANVAS_WIDTH = 140;
const RECT_CANVAS_HEIGHT = 100;
const DEFAULT_LAYOUT = {
  canvas: { width: 1280, height: 720 },
  title: { x: 420, y: 36, size: 64, visible: true },
  members: { x: 969, y: 302, size: 24, visible: true },
  time: { x: 969, y: 446, size: 24, visible: true },
  content: { x: 110, y: 389, size: 24, visible: true },
  voice: { x: 969, y: 590, size: 24, visible: true },
  contentBox: { x: 73, y: 281, width: 614, height: 360, visible: true },
  imageBox: { x: 880, y: 330, width: 300, height: 220, visible: false },
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

function isSameTextField(a: LayoutField, b: LayoutField) {
  return a.x === b.x && a.y === b.y && a.size === b.size && a.visible === b.visible;
}

function isSameBoxField(a: LayoutBox, b: LayoutBox) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height && a.visible === b.visible;
}

function isDefaultTemplateLayout(layout: RecruitCardCanvasProps['layout']) {
  return (
    isSameTextField(layout.title, DEFAULT_LAYOUT.title) &&
    isSameTextField(layout.members, DEFAULT_LAYOUT.members) &&
    isSameTextField(layout.time, DEFAULT_LAYOUT.time) &&
    isSameTextField(layout.content, DEFAULT_LAYOUT.content) &&
    isSameTextField(layout.voice, DEFAULT_LAYOUT.voice) &&
    isSameBoxField(layout.contentBox, DEFAULT_LAYOUT.contentBox) &&
    isSameBoxField(layout.imageBox, DEFAULT_LAYOUT.imageBox)
  );
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
      x: 0,
      y: 0,
      width,
      height,
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

function addClassicTitle(layer: Konva.Layer, width: number, title: string, accentColor: string) {
  const measure = createMeasure(8, true);
  const titleText = truncateTextByWidth(title || 'ゲーム募集', width - 16, measure);
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
      fill: '#ffffff',
      stroke: 'rgba(0, 0, 0, 0.5)',
      strokeWidth: 1,
      fontSize: 8,
      fontStyle: 'bold',
      fontFamily: 'CorporateRounded, Arial, sans-serif',
    })
  );

  layer.add(new Konva.Line({ points: [14, 9, bgX - 4, 9], stroke: 'rgba(0, 0, 0, 0.6)', strokeWidth: 1 }));
  layer.add(new Konva.Line({ points: [bgX + bgW + 4, 9, width - 14, 9], stroke: 'rgba(0, 0, 0, 0.6)', strokeWidth: 1 }));

  drawPin(layer, 8, 8, 'rgba(46, 213, 115, 0.7)');
  drawPin(layer, width - 8, 8, 'rgba(255, 71, 87, 0.7)');
}

function addTemplateTextNode(
  layer: Konva.Layer,
  field: LayoutField,
  text: string,
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
      fill: '#ffffff',
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
    group.add(new Konva.Text({ x: startX, y: startY + i * lineHeight, text: line, fill: '#ffffff', fontSize: sizePx, fontFamily: 'CorporateRounded' }));
  });

  if (onDragEnd) {
    const baseX = contentBox.visible ? contentBox.x : field.x;
    const baseY = contentBox.visible ? contentBox.y : field.y;
    group.on('dragend', () => onDragEnd(Math.round(baseX + group.x()), Math.round(baseY + group.y())));
  }
  layer.add(group);
}

function drawEmptyParticipantSlot(layer: Konva.Layer, x: number, y: number, radius: number, plusSize: number) {
  layer.add(new Konva.Circle({ x, y, radius, fill: '#333', stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1 }));
  layer.add(new Konva.Line({ points: [x - plusSize, y, x + plusSize, y], stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1 }));
  layer.add(new Konva.Line({ points: [x, y - plusSize, x, y + plusSize], stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1 }));
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
  backgroundImageUrl,
  scale = 1,
  onLayoutChange,
  onRenderedDataUrl,
}: RecruitCardCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const { width: canvasWidth, height: canvasHeight } = layout.canvas;
  const [containerSize, setContainerSize] = useState({ width: RECT_CANVAS_WIDTH, height: RECT_CANVAS_HEIGHT });

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
    const inTemplateMode = Boolean(backgroundImageUrl) || !isDefaultTemplateLayout(layout);

    const drawAsync = async () => {
      layer.add(new Konva.Rect({ x: 0, y: 0, width: RECT_CANVAS_WIDTH, height: RECT_CANVAS_HEIGHT, fill: '#101114' }));
      addGradientBorder(layer, RECT_CANVAS_WIDTH, RECT_CANVAS_HEIGHT, accentColor);

      if (inTemplateMode) {
        const scaledImageBox = scaleBoxToRect(layout.imageBox, layout.canvas);
        const scaledContentBox = scaleBoxToRect(layout.contentBox, layout.canvas);
        const scaledTitle = scaleTextFieldToRect(layout.title, layout.canvas);
        const scaledMembers = scaleTextFieldToRect(layout.members, layout.canvas);
        const scaledTime = scaleTextFieldToRect(layout.time, layout.canvas);
        const scaledVoice = scaleTextFieldToRect(layout.voice, layout.canvas);
        const scaledContent = scaleTextFieldToRect(layout.content, layout.canvas);

        if (scaledImageBox.visible) {
          const imageBoxRect = new Konva.Rect({
            x: scaledImageBox.x,
            y: scaledImageBox.y,
            width: scaledImageBox.width,
            height: scaledImageBox.height,
            fill: 'rgba(18, 20, 24, 0.95)',
            cornerRadius: 8,
            stroke: 'rgba(171, 230, 255, 0.5)',
            strokeWidth: 1,
            draggable: Boolean(onLayoutChange),
            dragBoundFunc: (pos) => pos,
          });
          if (onLayoutChange) {
            imageBoxRect.on('dragend', () => onLayoutChange('imageBox', toEditorX(imageBoxRect.x()), toEditorY(imageBoxRect.y())));
          }
          layer.add(imageBoxRect);

          if (backgroundImageUrl) {
            try {
              const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const i = new window.Image();
                i.crossOrigin = 'anonymous';
                i.onload = () => resolve(i);
                i.onerror = reject;
                i.src = backgroundImageUrl;
              });

              const imageNode = new Konva.Image({
                x: scaledImageBox.x,
                y: scaledImageBox.y,
                width: scaledImageBox.width,
                height: scaledImageBox.height,
                image: img,
                cornerRadius: 8,
              });
              layer.add(imageNode);
            } catch {
              // keep placeholder when image load fails
            }
          }
        }

        if (scaledContentBox.visible) {
          const box = new Konva.Rect({
            x: scaledContentBox.x,
            y: scaledContentBox.y,
            width: scaledContentBox.width,
            height: scaledContentBox.height,
            fill: 'rgba(0, 0, 0, 0.56)',
            cornerRadius: 8,
            stroke: 'rgba(255,255,255,0.30)',
            strokeWidth: 1,
            draggable: Boolean(onLayoutChange),
          });
          if (onLayoutChange) {
            box.on('dragend', () => onLayoutChange('contentBox', toEditorX(box.x()), toEditorY(box.y())));
          }
          layer.add(box);
        }

        addTemplateTextNode(layer, scaledTitle, recruitData.title || '募集タイトル', Boolean(onLayoutChange), (x, y) => onLayoutChange?.('title', toEditorX(x), toEditorY(y)));
        addTemplateTextNode(layer, scaledMembers, `👥 ${participants}人`, Boolean(onLayoutChange), (x, y) => onLayoutChange?.('members', toEditorX(x), toEditorY(y)));
        addTemplateTextNode(layer, scaledTime, `🕒 ${recruitData.startTimeText || '今から'}`, Boolean(onLayoutChange), (x, y) => onLayoutChange?.('time', toEditorX(x), toEditorY(y)));
        addTemplateTextNode(layer, scaledVoice, `🎙 ${voiceText}`, Boolean(onLayoutChange), (x, y) => onLayoutChange?.('voice', toEditorX(x), toEditorY(y)));
        addTemplateContentNode(layer, scaledContent, scaledContentBox, recruitData.content || 'ガチエリア / 初心者歓迎', Boolean(onLayoutChange), (x, y) => onLayoutChange?.('content', toEditorX(x), toEditorY(y)));
      } else {
        addClassicTitle(layer, RECT_CANVAS_WIDTH, recruitData.title || 'ゲーム募集', accentColor);

        const boxX = 8;
        const boxY = RECT_CANVAS_HEIGHT * 0.39;
        const boxWidth = RECT_CANVAS_WIDTH * 0.48;
        const boxHeight = RECT_CANVAS_HEIGHT * 0.5;

        layer.add(new Konva.Rect({
          x: boxX,
          y: boxY,
          width: boxWidth,
          height: boxHeight,
          cornerRadius: 6,
          fill: 'rgba(0,0,0,0.75)',
          stroke: 'rgba(255,255,255,0.6)',
          strokeWidth: 1,
        }));

        const is2Rows = participants > 8;
        const circleRadius = is2Rows ? 4 : 6.5;
        const circleSpacing = is2Rows ? 11 : 16;
        const rowSpacing = is2Rows ? 10 : 15;
        const areaY = is2Rows ? boxY - 18 : boxY - 14;
        const areaX = boxX + 5;

        for (let i = 0; i < participants; i++) {
          const row = Math.floor(i / 8);
          const col = i % 8;
          drawEmptyParticipantSlot(layer, areaX + col * circleSpacing, areaY + row * rowSpacing, circleRadius, is2Rows ? 2.5 : 4);
        }

        layer.add(new Konva.Text({ x: boxX + 4, y: boxY + 3, text: '募集内容', fill: '#bbb', fontSize: 6, fontStyle: 'bold', fontFamily: 'CorporateRounded, Arial, sans-serif' }));

        const contentLines = wrapTextLines(recruitData.content || 'ガチエリア / 初心者歓迎', boxWidth - 16, createMeasure(4));
        contentLines.slice(0, Math.floor((boxHeight - 20) / 6)).forEach((line, i) => {
          layer.add(new Konva.Text({ x: boxX + 4, y: boxY + 15 + i * 6, text: line, fill: '#fff', fontSize: 4, fontFamily: 'CorporateRounded, Arial, sans-serif' }));
        });

        const info = [
          { label: '人数：', value: `0/${participants}人` },
          { label: '時間：', value: `${recruitData.startTimeText || '指定なし'}~` },
          { label: '通話：', value: voiceText },
        ];

        const rightX = RECT_CANVAS_WIDTH - 54;
        const startY = 36;
        info.forEach((item, i) => {
          const y = startY + i * 20;
          layer.add(new Konva.Rect({ x: rightX, y, width: 48, height: 15, cornerRadius: 3, fill: 'rgba(0,0,0,0.75)', stroke: 'rgba(255,255,255,0.6)', strokeWidth: 0.5 }));
          layer.add(new Konva.Text({ x: rightX + 3, y: y + 6, text: item.label, fill: '#bbb', fontSize: 4, fontStyle: 'bold', fontFamily: 'CorporateRounded, Arial, sans-serif' }));
          layer.add(new Konva.Text({ x: rightX + 20, y: y + 6, text: truncateTextByWidth(item.value, 25, createMeasure(4)), fill: '#fff', fontSize: 4, fontFamily: 'CorporateRounded, Arial, sans-serif' }));
        });
      }

      layer.draw();

      if (onRenderedDataUrl) {
        onRenderedDataUrl(stage.toDataURL({ pixelRatio: 1 }));
      }
    };

    void drawAsync();

    return () => {
      stage.destroy();
    };
  }, [recruitData, layout, accentColor, backgroundImageUrl, scale, canvasWidth, canvasHeight, containerSize, onLayoutChange, onRenderedDataUrl]);

  return (
    <div className="relative w-full bg-gray-950 border border-gray-700 rounded overflow-hidden" style={{ aspectRatio: `${layout.canvas.width} / ${layout.canvas.height}` }}>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
