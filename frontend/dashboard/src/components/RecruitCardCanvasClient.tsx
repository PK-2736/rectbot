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
}

const DEFAULT_ACCENT_COLOR = 'FF6B9D';
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
    fontFamily: 'CorporateRounded, Arial, sans-serif',
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

  const border = new Konva.Shape({
    sceneFunc: (context, shape) => {
      const grad = context.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, light);
      grad.addColorStop(0.5, base);
      grad.addColorStop(1, dark);
      context.strokeStyle = grad;
      context.lineWidth = 5;
      context.strokeRect(0, 0, width, height);
      context.fillStrokeShape(shape);
    },
  });

  layer.add(border);
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

  const sizePx = Math.max(10, field.size);
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
      fontFamily: 'CorporateRounded, Arial, sans-serif',
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

  const sizePx = Math.max(10, field.size);
  const lineHeight = Math.round(sizePx * 1.25);
  const measure = createMeasure(sizePx, false);
  const maxWidth = Math.max(120, contentBox.visible ? contentBox.width - 24 : 420);
  const lines = wrapTextLines(text || '募集内容を入力', maxWidth, measure).slice(0, 6);

  const group = new Konva.Group({ x: field.x, y: field.y, draggable });
  if (!contentBox.visible) {
    const maxTextWidth = Math.max(...lines.map((line) => Math.ceil(measure(line))), 40);
    const textPaddingX = Math.max(8, Math.round(sizePx * 0.25));
    const textPaddingY = Math.max(4, Math.round(sizePx * 0.2));
    const rectWidth = maxTextWidth + textPaddingX * 2;
    const rectHeight = lineHeight * lines.length + textPaddingY * 2;
    const radius = Math.max(6, Math.round(sizePx * 0.2));
    group.add(new Konva.Rect({ width: rectWidth, height: rectHeight, cornerRadius: radius, fill: 'rgba(0,0,0,0.45)' }));
    group.add(new Konva.Rect({ width: rectWidth, height: rectHeight, cornerRadius: radius, stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1 }));
    lines.forEach((line, i) => {
      group.add(new Konva.Text({ x: textPaddingX, y: textPaddingY + i * lineHeight, text: line, fill: '#ffffff', fontSize: sizePx, fontFamily: 'CorporateRounded, Arial, sans-serif' }));
    });
  } else {
    lines.forEach((line, i) => {
      group.add(new Konva.Text({ x: 12, y: 12 + i * lineHeight, text: line, fill: '#ffffff', fontSize: sizePx, fontFamily: 'CorporateRounded, Arial, sans-serif' }));
    });
  }

  if (onDragEnd) {
    group.on('dragend', () => onDragEnd(Math.round(group.x()), Math.round(group.y())));
  }
  layer.add(group);
}

function drawEmptyParticipantSlot(layer: Konva.Layer, x: number, y: number, radius: number, plusSize: number) {
  layer.add(new Konva.Circle({ x, y, radius, fill: '#333', stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1 }));
  layer.add(new Konva.Line({ points: [x - plusSize, y, x + plusSize, y], stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1 }));
  layer.add(new Konva.Line({ points: [x, y - plusSize, x, y + plusSize], stroke: 'rgba(255,255,255,0.3)', strokeWidth: 1 }));
}

export function RecruitCardCanvasImpl({
  recruitData,
  layout,
  accentColor = DEFAULT_ACCENT_COLOR,
  backgroundImageUrl,
  scale = 1,
  onLayoutChange,
}: RecruitCardCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [fitScale, setFitScale] = useState(scale);
  const { width: canvasWidth, height: canvasHeight } = layout.canvas;

  useEffect(() => {
    if (!containerRef.current) return;

    const updateFitScale = () => {
      const containerWidth = containerRef.current?.clientWidth ?? canvasWidth;
      const responsiveScale = Math.min(scale, containerWidth / canvasWidth);
      setFitScale(Number.isFinite(responsiveScale) && responsiveScale > 0 ? responsiveScale : scale);
    };

    updateFitScale();

    const observer = new ResizeObserver(() => updateFitScale());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [canvasWidth, scale]);

  useEffect(() => {
    if (!containerRef.current) return;

    const stage = new Konva.Stage({
      container: containerRef.current,
      width: canvasWidth * fitScale,
      height: canvasHeight * fitScale,
    });
    stageRef.current = stage;

    const layer = new Konva.Layer();
    stage.add(layer);

    const participants = clamp(Number(recruitData.participants || 4), 0, 16);
    const voiceText = recruitData.voicePlace || '指定なし';
    const inTemplateMode = Boolean(backgroundImageUrl) || !isDefaultTemplateLayout(layout);

    const drawAsync = async () => {
      layer.add(new Konva.Rect({ x: 0, y: 0, width: canvasWidth, height: canvasHeight, fill: '#101114' }));
      addGradientBorder(layer, canvasWidth, canvasHeight, accentColor);

      if (inTemplateMode) {
        if (layout.imageBox.visible) {
          const imageBoxRect = new Konva.Rect({
            x: layout.imageBox.x,
            y: layout.imageBox.y,
            width: layout.imageBox.width,
            height: layout.imageBox.height,
            fill: 'rgba(18, 20, 24, 0.95)',
            cornerRadius: 8,
            stroke: 'rgba(171, 230, 255, 0.5)',
            strokeWidth: 1,
            draggable: Boolean(onLayoutChange),
            dragBoundFunc: (pos) => pos,
          });
          if (onLayoutChange) {
            imageBoxRect.on('dragend', () => onLayoutChange('imageBox', Math.round(imageBoxRect.x()), Math.round(imageBoxRect.y())));
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
                x: layout.imageBox.x,
                y: layout.imageBox.y,
                width: layout.imageBox.width,
                height: layout.imageBox.height,
                image: img,
                cornerRadius: 8,
              });
              layer.add(imageNode);
            } catch {
              // keep placeholder when image load fails
            }
          }
        }

        if (layout.contentBox.visible) {
          const box = new Konva.Rect({
            x: layout.contentBox.x,
            y: layout.contentBox.y,
            width: layout.contentBox.width,
            height: layout.contentBox.height,
            fill: 'rgba(0, 0, 0, 0.56)',
            cornerRadius: 8,
            stroke: 'rgba(255,255,255,0.30)',
            strokeWidth: 1,
            draggable: Boolean(onLayoutChange),
          });
          if (onLayoutChange) {
            box.on('dragend', () => onLayoutChange('contentBox', Math.round(box.x()), Math.round(box.y())));
          }
          layer.add(box);
        }

        addTemplateTextNode(layer, layout.title, recruitData.title || '募集タイトル', Boolean(onLayoutChange), (x, y) => onLayoutChange?.('title', x, y));
        addTemplateTextNode(layer, layout.members, `👥 ${participants}人`, Boolean(onLayoutChange), (x, y) => onLayoutChange?.('members', x, y));
        addTemplateTextNode(layer, layout.time, `🕒 ${recruitData.startTimeText || '今から'}`, Boolean(onLayoutChange), (x, y) => onLayoutChange?.('time', x, y));
        addTemplateTextNode(layer, layout.voice, `🎙 ${voiceText}`, Boolean(onLayoutChange), (x, y) => onLayoutChange?.('voice', x, y));
        addTemplateContentNode(layer, layout.content, layout.contentBox, recruitData.content || 'ガチエリア / 初心者歓迎', Boolean(onLayoutChange), (x, y) => onLayoutChange?.('content', x, y));
      } else {
        addClassicTitle(layer, canvasWidth, recruitData.title || 'ゲーム募集', accentColor);

        const boxX = 8;
        const boxY = canvasHeight * 0.39;
        const boxWidth = canvasWidth * 0.48;
        const boxHeight = canvasHeight * 0.5;

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

        const rightX = canvasWidth - 54;
        const startY = 36;
        info.forEach((item, i) => {
          const y = startY + i * 20;
          layer.add(new Konva.Rect({ x: rightX, y, width: 48, height: 15, cornerRadius: 3, fill: 'rgba(0,0,0,0.75)', stroke: 'rgba(255,255,255,0.6)', strokeWidth: 0.5 }));
          layer.add(new Konva.Text({ x: rightX + 3, y: y + 6, text: item.label, fill: '#bbb', fontSize: 4, fontStyle: 'bold', fontFamily: 'CorporateRounded, Arial, sans-serif' }));
          layer.add(new Konva.Text({ x: rightX + 20, y: y + 6, text: truncateTextByWidth(item.value, 25, createMeasure(4)), fill: '#fff', fontSize: 4, fontFamily: 'CorporateRounded, Arial, sans-serif' }));
        });
      }

      layer.draw();
    };

    void drawAsync();

    return () => {
      stage.destroy();
    };
  }, [recruitData, layout, accentColor, backgroundImageUrl, fitScale, canvasWidth, canvasHeight, onLayoutChange]);

  return (
    <div className="relative w-full bg-gray-950 border border-gray-700 rounded overflow-hidden" style={{ aspectRatio: `${layout.canvas.width} / ${layout.canvas.height}` }}>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
