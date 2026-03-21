"use client";

import { useState } from "react";
import RecruitCardCanvas from "@/components/RecruitCardCanvas";

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

export default function TestKonvaPage() {
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [title, setTitle] = useState("募集タイトル");
  const [content, setContent] = useState("ガチエリア / 初心者歓迎");
  const [participants, setParticipants] = useState("4");
  const [startTime, setStartTime] = useState("今から");
  const [voicePlace, setVoicePlace] = useState("通話あり");
  const [accentColor, setAccentColor] = useState("5865F2");

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">react-konva Recruit Card Canvas Test</h1>
        <p className="text-gray-400">/rectと同じ描画を Konva で再現</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Canvas Display */}
        <section className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">リアルタイムプレビュー</h2>
          <RecruitCardCanvas
            recruitData={{
              title,
              content,
              participants: parseInt(participants) || 4,
              startTimeText: startTime,
              voicePlace,
            }}
            layout={layout}
            accentColor={accentColor}
            scale={0.5}
            onLayoutChange={(field: string, x: number, y: number) => {
              setLayout((prev) => {
                const updated = { ...prev };
                const fieldKey = field as keyof typeof DEFAULT_LAYOUT;
                const item = updated[fieldKey];
                if (item && typeof item === 'object' && 'x' in item) {
                  (item as { x: number; y: number }).x = x;
                  (item as { x: number; y: number }).y = y;
                }
                return updated;
              });
            }}
          />
          <p className="text-xs text-gray-400 mt-4">キャンバス内でテキスト/ボックスをドラッグして移動できます</p>
        </section>

        {/* Controls */}
        <section className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-4">コントロール</h2>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-300 mb-2">タイトル</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-2">内容</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white h-20"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-300 mb-2">参加人数</label>
                <input
                  type="number"
                  value={participants}
                  onChange={(e) => setParticipants(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">開始時刻</label>
                <input
                  type="text"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-2">通話表示</label>
              <input
                type="text"
                value={voicePlace}
                onChange={(e) => setVoicePlace(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-2">アクセント色 (HEX)</label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value.replace(/^#/, ''))}
                  className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white"
                  placeholder="5865F2"
                />
                <div
                  className="w-12 h-10 rounded border border-gray-600"
                  style={{ backgroundColor: `#${accentColor}` }}
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-700">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">レイアウト座標</h3>
            <div className="bg-gray-900/50 rounded p-3 text-xs font-mono text-gray-400 space-y-1 max-h-48 overflow-auto">
              {["title", "members", "time", "content", "voice"].map((field) => {
                const fieldKey = field as keyof typeof DEFAULT_LAYOUT;
                const item = layout[fieldKey];
                if (item && typeof item === 'object' && 'x' in item && 'y' in item) {
                  const field_item = item as { x: number; y: number };
                  return (
                    <div key={field}>
                      <strong>{field}:</strong> x={field_item.x} y={field_item.y}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
