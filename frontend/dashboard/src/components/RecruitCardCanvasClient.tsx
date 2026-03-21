'use client';

import { useRef, useEffect } from 'react';
import Konva from 'konva';

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
    title: { x: number; y: number; size: number; visible: boolean };
    members: { x: number; y: number; size: number; visible: boolean };
    time: { x: number; y: number; size: number; visible: boolean };
    content: { x: number; y: number; size: number; visible: boolean };
    voice: { x: number; y: number; size: number; visible: boolean };
    contentBox: { x: number; y: number; width: number; height: number; visible: boolean };
    imageBox: { x: number; y: number; width: number; height: number; visible: boolean };
  };
  accentColor?: string;
  scale?: number;
  onLayoutChange?: (field: string, x: number, y: number) => void;
}

const DEFAULT_ACCENT_COLOR = 'FF6B9D';

function calculateParticipantLayout(maxMembers: number) {
  const baseX = 110;
  const baseY = 300;
  const baseWidth = 300;
  const baseHeight = 250;

  if (maxMembers <= 2) {
    return { baseX, baseY, baseWidth, baseHeight, circleRadius: 30, spacing: 80, rowSpacing: 80, maxPerRow: 2 };
  } else if (maxMembers <= 4) {
    return { baseX, baseY, baseWidth, baseHeight, circleRadius: 26, spacing: 90, rowSpacing: 90, maxPerRow: 2 };
  }
  return { baseX, baseY, baseWidth, baseHeight, circleRadius: 20, spacing: 80, rowSpacing: 85, maxPerRow: 3 };
}

export function RecruitCardCanvasImpl(props: RecruitCardCanvasProps) {
  const { recruitData, layout, accentColor = DEFAULT_ACCENT_COLOR, scale = 1, onLayoutChange } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const { width: canvasWidth, height: canvasHeight } = layout.canvas;
  const scaledWidth = canvasWidth * scale;
  const scaledHeight = canvasHeight * scale;

  useEffect(() => {
    if (!containerRef.current) return;

    const stage = new Konva.Stage({ container: containerRef.current, width: scaledWidth, height: scaledHeight });
    stageRef.current = stage;
    const layer = new Konva.Layer();
    stage.add(layer);

    const background = new Konva.Rect({ x: 0, y: 0, width: canvasWidth, height: canvasHeight, fill: '#101114' });
    layer.add(background);

    const border = new Konva.Rect({
      x: 2.5, y: 2.5, width: canvasWidth - 5, height: canvasHeight - 5, stroke: `#${accentColor}`,
      strokeWidth: 5, fillEnabled: false,
    });
    layer.add(border);

    if (layout.contentBox.visible) {
      const contentBox = new Konva.Rect({
        x: layout.contentBox.x, y: layout.contentBox.y, width: layout.contentBox.width, height: layout.contentBox.height,
        fill: 'rgba(0, 0, 0, 0.75)', cornerRadius: 8, stroke: 'rgba(255, 255, 255, 0.6)', strokeWidth: 1, draggable: !!onLayoutChange,
      });
      if (onLayoutChange) {
        contentBox.on('dragend', (e: Konva.KonvaEventObject<DragEvent>) => onLayoutChange('contentBox', Math.round(e.target.x()), Math.round(e.target.y())));
      }
      layer.add(contentBox);
    }

    if (layout.imageBox.visible) {
      const imageBox = new Konva.Rect({
        x: layout.imageBox.x, y: layout.imageBox.y, width: layout.imageBox.width, height: layout.imageBox.height,
        fill: 'rgba(18, 20, 24, 0.95)', cornerRadius: 8, stroke: 'rgba(171, 230, 255, 0.5)', strokeWidth: 1, draggable: !!onLayoutChange,
      });
      if (onLayoutChange) {
        imageBox.on('dragend', (e: Konva.KonvaEventObject<DragEvent>) => onLayoutChange('imageBox', Math.round(e.target.x()), Math.round(e.target.y())));
      }
      layer.add(imageBox);
    }

    if (layout.title.visible) {
      const titleText = new Konva.Text({
        x: layout.title.x, y: layout.title.y, text: recruitData.title || '募集タイトル', fontSize: layout.title.size,
        fontFamily: 'Arial, sans-serif', fontStyle: 'bold', fill: '#ffffff', align: 'center', draggable: !!onLayoutChange,
      });
      if (onLayoutChange) titleText.on('dragend', (e: Konva.KonvaEventObject<DragEvent>) => onLayoutChange('title', Math.round(e.target.x()), Math.round(e.target.y())));
      layer.add(titleText);
    }

    if (layout.members.visible) {
      const membersText = new Konva.Text({
        x: layout.members.x, y: layout.members.y, text: `👥 ${recruitData.participants || 4}人`, fontSize: layout.members.size,
        fontFamily: 'Arial, sans-serif', fill: '#bbb', align: 'left', draggable: !!onLayoutChange,
      });
      if (onLayoutChange) membersText.on('dragend', (e: Konva.KonvaEventObject<DragEvent>) => onLayoutChange('members', Math.round(e.target.x()), Math.round(e.target.y())));
      layer.add(membersText);
    }

    if (layout.time.visible) {
      const timeText = new Konva.Text({
        x: layout.time.x, y: layout.time.y, text: `🕒 ${recruitData.startTimeText || '今から'}`, fontSize: layout.time.size,
        fontFamily: 'Arial, sans-serif', fill: '#bbb', align: 'left', draggable: !!onLayoutChange,
      });
      if (onLayoutChange) timeText.on('dragend', (e: Konva.KonvaEventObject<DragEvent>) => onLayoutChange('time', Math.round(e.target.x()), Math.round(e.target.y())));
      layer.add(timeText);
    }

    if (layout.voice.visible) {
      const voiceText = new Konva.Text({
        x: layout.voice.x, y: layout.voice.y, text: `🎙 ${recruitData.voicePlace || '指定なし'}`, fontSize: layout.voice.size,
        fontFamily: 'Arial, sans-serif', fill: '#bbb', align: 'left', draggable: !!onLayoutChange,
      });
      if (onLayoutChange) voiceText.on('dragend', (e: Konva.KonvaEventObject<DragEvent>) => onLayoutChange('voice', Math.round(e.target.x()), Math.round(e.target.y())));
      layer.add(voiceText);
    }

    if (layout.content.visible) {
      const contentText = new Konva.Text({
        x: layout.content.x, y: layout.content.y, text: recruitData.content || 'ガチエリア / 初心者歓迎', fontSize: layout.content.size,
        fontFamily: 'Arial, sans-serif', fill: '#bbb', width: 320, align: 'left', wrap: 'word', draggable: !!onLayoutChange,
      });
      if (onLayoutChange) contentText.on('dragend', (e: Konva.KonvaEventObject<DragEvent>) => onLayoutChange('content', Math.round(e.target.x()), Math.round(e.target.y())));
      layer.add(contentText);
    }

    const participantLayout = calculateParticipantLayout(recruitData.participants || 4);
    for (let i = 0; i < (recruitData.participants || 4); i++) {
      const row = Math.floor(i / participantLayout.maxPerRow);
      const col = i % participantLayout.maxPerRow;
      const offsetX = participantLayout.baseWidth / 2 - ((participantLayout.maxPerRow - 1) * participantLayout.spacing) / 2;
      const x = participantLayout.baseX + offsetX + col * participantLayout.spacing;
      const y = participantLayout.baseY + 80 + row * participantLayout.rowSpacing;

      const circle = new Konva.Circle({ x, y, radius: participantLayout.circleRadius, fill: '#333', stroke: 'rgba(255, 255, 255, 0.3)', strokeWidth: 1 });
      layer.add(circle);

      const horizontalLine = new Konva.Line({
        points: [x - participantLayout.circleRadius * 0.35, y, x + participantLayout.circleRadius * 0.35, y],
        stroke: 'rgba(255, 255, 255, 0.3)', strokeWidth: 1.5,
      });
      layer.add(horizontalLine);

      const verticalLine = new Konva.Line({
        points: [x, y - participantLayout.circleRadius * 0.35, x, y + participantLayout.circleRadius * 0.35],
        stroke: 'rgba(255, 255, 255, 0.3)', strokeWidth: 1.5,
      });
      layer.add(verticalLine);
    }

    layer.draw();

    return () => stage.destroy();
  }, [recruitData, layout, accentColor, scaledWidth, scaledHeight, canvasWidth, canvasHeight, onLayoutChange]);

  return (
    <div className="relative w-full bg-gray-950 border border-gray-700 rounded overflow-hidden" style={{ aspectRatio: '16 / 9' }}>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
