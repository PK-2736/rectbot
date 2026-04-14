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
    contentLabel: string;
    membersLabel: string;
    timeLabel: string;
    voiceLabel: string;
    title: LayoutField;
    members: LayoutField;
    time: LayoutField;
    content: LayoutField;
    voice: LayoutField;
    contentBox: LayoutBox;
    imageBox: LayoutBox;
    membersBox: LayoutBox;
    timeBox: LayoutBox;
    voiceBox: LayoutBox;
    participantsBox?: LayoutBox;
    contentBoxColor?: string;
    imageBoxColor?: string;
    participantsBoxColor?: string;
    membersBoxColor?: string;
    timeBoxColor?: string;
    voiceBoxColor?: string;
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
  contentLabel: '募集内容',
  membersLabel: '人数：',
  timeLabel: '時間：',
  voiceLabel: '通話：',
  title: { x: 420, y: 36, size: 64, visible: true },
  members: { x: 969, y: 302, size: 24, visible: true },
  time: { x: 969, y: 446, size: 24, visible: true },
  content: { x: 110, y: 389, size: 24, visible: true },
  voice: { x: 969, y: 590, size: 24, visible: true },
  contentBox: { x: 73, y: 281, width: 614, height: 360, visible: true },
  imageBox: { x: 880, y: 330, width: 300, height: 220, visible: false },
  membersBox: { x: 969, y: 302, width: 400, height: 56, visible: true },
  timeBox: { x: 969, y: 446, width: 400, height: 56, visible: true },
  voiceBox: { x: 969, y: 590, width: 400, height: 56, visible: true },
  participantsBox: { x: 119, y: 180, width: 1134, height: 158, visible: true },
  contentBoxColor: '#FFFFFF',
  imageBoxColor: '#FFFFFF',
  participantsBoxColor: '#FFFFFF',
  membersBoxColor: '#FFFFFF',
  timeBoxColor: '#FFFFFF',
  voiceBoxColor: '#FFFFFF',
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

function withAlpha(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

function renderInfoBox(
  layer: Konva.Layer,
  box: LayoutBox,
  label: string,
  value: string,
  frameColor: string,
  textColor: string,
  draggable: boolean,
  onDragEnd?: (x: number, y: number) => void
) {
  if (!box.visible) return;

  const paddingX = Math.max(3, Math.round(box.height * 0.2));
  const paddingY = Math.max(2, Math.round(box.height * 0.2));

  const maxLabelAreaWidth = Math.max(10, Math.round(box.width * 0.42));
  const maxContentHeight = Math.max(6, box.height - paddingY * 2);

  const fitLabelSize = () => {
    const base = Math.max(4, Math.round(box.height * 0.32));
    for (let size = base; size >= 2; size -= 1) {
      const measure = createMeasure(size, true);
      if (measure(label) <= maxLabelAreaWidth) return size;
    }
    return 2;
  };

  const labelSize = fitLabelSize();
  const labelMeasure = createMeasure(labelSize, true);
  const labelText = label;
  const labelWidth = Math.ceil(labelMeasure(labelText));
  const valueX = paddingX + labelWidth + 4;
  const valueMaxWidth = Math.max(12, box.width - valueX - paddingX);

  const fitValue = () => {
    const base = Math.max(4, Math.round(box.height * 0.3));
    for (let size = base; size >= 2; size -= 1) {
      const measure = createMeasure(size, false);
      const lines = wrapTextLines(value, valueMaxWidth, measure);
      const lineHeight = Math.max(3, Math.round(size * 1.15));
      if (lines.length * lineHeight <= maxContentHeight) {
        return { size, lines, lineHeight };
      }
    }
    const minSize = 2;
    const minMeasure = createMeasure(minSize, false);
    return {
      size: minSize,
      lines: wrapTextLines(value, valueMaxWidth, minMeasure),
      lineHeight: Math.max(3, Math.round(minSize * 1.15)),
    };
  };

  const fittedValue = fitValue();

  const group = new Konva.Group({ x: box.x, y: box.y, draggable });
  group.add(new Konva.Rect({ x: 0, y: 0, width: box.width, height: box.height, cornerRadius: Math.max(3, Math.round(box.height / 4)), fill: 'rgba(0,0,0,0.75)', stroke: withAlpha(frameColor, 0.85), strokeWidth: 0.8 }));
  group.add(new Konva.Text({ x: paddingX, y: paddingY, text: labelText, fill: withAlpha(frameColor, 0.95), fontSize: labelSize, fontStyle: 'bold', fontFamily: 'CorporateRounded, Arial, sans-serif' }));
  group.add(new Konva.Text({ x: valueX, y: paddingY, text: fittedValue.lines.join('\n'), fill: textColor, fontSize: fittedValue.size, lineHeight: fittedValue.lineHeight / fittedValue.size, fontFamily: 'CorporateRounded, Arial, sans-serif' }));

  if (onDragEnd) {
    group.on('dragend', () => onDragEnd(Math.round(group.x()), Math.round(group.y())));
  }

  layer.add(group);
}

function drawEmptyParticipantSlot(target: Konva.Layer | Konva.Group, x: number, y: number, radius: number, plusSize: number, frameColor: string) {
  const strokeColor = withAlpha(frameColor, 0.7);
  target.add(new Konva.Circle({ x, y, radius, fill: '#333', stroke: strokeColor, strokeWidth: 1 }));
  target.add(new Konva.Line({ points: [x - plusSize, y, x + plusSize, y], stroke: strokeColor, strokeWidth: 1 }));
  target.add(new Konva.Line({ points: [x, y - plusSize, x, y + plusSize], stroke: strokeColor, strokeWidth: 1 }));
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
  const resolvedFrameColor = normalizeHexColor(accentColor, `#${DEFAULT_ACCENT_COLOR}`);
  const contentBoxFrameColor = normalizeHexColor(layout.contentBoxColor, resolvedFrameColor);
  const imageBoxFrameColor = normalizeHexColor(layout.imageBoxColor, resolvedFrameColor);
  const participantsBoxFrameColor = normalizeHexColor(layout.participantsBoxColor, resolvedFrameColor);
  const membersBoxFrameColor = normalizeHexColor(layout.membersBoxColor, resolvedFrameColor);
  const timeBoxFrameColor = normalizeHexColor(layout.timeBoxColor, resolvedFrameColor);
  const voiceBoxFrameColor = normalizeHexColor(layout.voiceBoxColor, resolvedFrameColor);
  
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
    const scaledMembersBox = scaleBoxToRect(layout.membersBox || DEFAULT_LAYOUT.membersBox, layout.canvas);
    const scaledTimeBox = scaleBoxToRect(layout.timeBox || DEFAULT_LAYOUT.timeBox, layout.canvas);
    const scaledVoiceBox = scaleBoxToRect(layout.voiceBox || DEFAULT_LAYOUT.voiceBox, layout.canvas);

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
        stroke: withAlpha(contentBoxFrameColor, 0.85),
        strokeWidth: 1,
      }));
      contentGroup.add(new Konva.Text({
        x: 4,
        y: 3,
        text: layout.contentLabel || '募集内容',
        fill: withAlpha(contentBoxFrameColor, 0.95),
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
            is2Rows ? 2.5 : 4,
            participantsBoxFrameColor
          );
        }
        layer.add(participantsGroup);
      }

      const infoItems = [
        { key: 'membersBox', box: scaledMembersBox, label: layout.membersLabel || '人数：', value: `${Math.min(1, participants)}/${participants}人`, frameColor: membersBoxFrameColor },
        { key: 'timeBox', box: scaledTimeBox, label: layout.timeLabel || '時間：', value: `${recruitData.startTimeText || '今から'}~`, frameColor: timeBoxFrameColor },
        { key: 'voiceBox', box: scaledVoiceBox, label: layout.voiceLabel || '通話：', value: voiceText, frameColor: voiceBoxFrameColor },
      ];

      infoItems.forEach((item) => {
        renderInfoBox(
          layer,
          item.box,
          item.label,
          item.value,
          item.frameColor,
          resolvedTextColor,
          Boolean(onLayoutChangeRef.current),
          onLayoutChangeRef.current ? (x, y) => onLayoutChangeRef.current?.(item.key, toEditorX(x), toEditorY(y)) : undefined
        );
      });

      if (scaledImageBox.visible) {
        const drawImageBorder = () => {
          layer.add(new Konva.Rect({
            x: scaledImageBox.x,
            y: scaledImageBox.y,
            width: scaledImageBox.width,
            height: scaledImageBox.height,
            cornerRadius: 6,
            stroke: withAlpha(imageBoxFrameColor, 0.9),
            strokeWidth: 1,
            fillEnabled: false,
          }));
        };

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
            drawImageBorder();
          } catch {
            drawImageBorder();
          }
        } else {
          drawImageBorder();
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
  }, [recruitData, layout, accentColor, textColor, resolvedTextColor, resolvedFrameColor, contentBoxFrameColor, imageBoxFrameColor, participantsBoxFrameColor, membersBoxFrameColor, timeBoxFrameColor, voiceBoxFrameColor, backgroundImageUrl, scale, canvasWidth, canvasHeight, containerSize]);

  return (
    <div className="w-full bg-gray-950 overflow-hidden" style={{ aspectRatio: `${layout.canvas.width} / ${layout.canvas.height}` }}>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
