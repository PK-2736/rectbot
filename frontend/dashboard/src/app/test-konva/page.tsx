"use client";

import { useEffect, useMemo, useState } from "react";
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
  participantsBox: { x: 119, y: 180, width: 1134, height: 158, visible: true },
};

export default function TestKonvaPage() {
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [title, setTitle] = useState("募集タイトル");
  const [content, setContent] = useState("ガチエリア / 初心者歓迎");
  const [participants, setParticipants] = useState("4");
  const [startTime, setStartTime] = useState("今から");
  const [voicePlace, setVoicePlace] = useState("通話あり");
  const [accentColor, setAccentColor] = useState("5865F2");
  const [previewDataUrl, setPreviewDataUrl] = useState("");
  const [totalDiff, setTotalDiff] = useState(0);
  const [regionDiffs, setRegionDiffs] = useState<Array<{ name: string; diff: number }>>([]);

  const referenceImageUrl = "/rect-reference/default.png";

  const regions = useMemo(
    () => [
      { name: "title", x: 0, y: 0, w: 140, h: 18 },
      { name: "participants", x: 8, y: 20, w: 90, h: 18 },
      { name: "contentBox", x: 8, y: 39, w: 68, h: 50 },
      { name: "rightInfo", x: 86, y: 34, w: 50, h: 56 },
      { name: "border", x: 0, y: 0, w: 140, h: 100 },
    ],
    []
  );

  useEffect(() => {
    if (!previewDataUrl) return;

    let cancelled = false;
    const calc = async () => {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });

      try {
        const [reference, preview] = await Promise.all([load(referenceImageUrl), load(previewDataUrl)]);

        const normRef = document.createElement("canvas");
        normRef.width = 140;
        normRef.height = 100;
        const refCtx = normRef.getContext("2d");
        if (!refCtx) return;
        refCtx.drawImage(reference, 0, 0, 140, 100);

        const normPreview = document.createElement("canvas");
        normPreview.width = 140;
        normPreview.height = 100;
        const prevCtx = normPreview.getContext("2d");
        if (!prevCtx) return;
        prevCtx.drawImage(preview, 0, 0, 140, 100);

        const refData = refCtx.getImageData(0, 0, 140, 100).data;
        const prevData = prevCtx.getImageData(0, 0, 140, 100).data;

        const getDiffForRegion = (x: number, y: number, w: number, h: number) => {
          let sum = 0;
          let pixels = 0;
          for (let py = y; py < y + h; py++) {
            for (let px = x; px < x + w; px++) {
              const i = (py * 140 + px) * 4;
              const dr = Math.abs(refData[i] - prevData[i]);
              const dg = Math.abs(refData[i + 1] - prevData[i + 1]);
              const db = Math.abs(refData[i + 2] - prevData[i + 2]);
              sum += dr + dg + db;
              pixels += 1;
            }
          }
          return pixels > 0 ? sum / (pixels * 3) : 0;
        };

        const total = getDiffForRegion(0, 0, 140, 100);
        const perRegion = regions
          .map((r) => ({ name: r.name, diff: getDiffForRegion(r.x, r.y, r.w, r.h) }))
          .sort((a, b) => b.diff - a.diff);

        if (!cancelled) {
          setTotalDiff(Number(total.toFixed(2)));
          setRegionDiffs(perRegion.map((r) => ({ name: r.name, diff: Number(r.diff.toFixed(2)) })));
        }
      } catch {
        if (!cancelled) {
          setTotalDiff(0);
          setRegionDiffs([]);
        }
      }
    };

    void calc();
    return () => {
      cancelled = true;
    };
  }, [previewDataUrl, referenceImageUrl, regions]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">react-konva Recruit Card Canvas Test</h1>
        <p className="text-gray-400">/rectと同じ描画を Konva で再現</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Canvas Display */}
        <section className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">リアルタイムプレビュー（比較モード）</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-sm text-gray-300 mb-2">/rect 実画像（基準）</p>
              <img src={referenceImageUrl} alt="rect reference" className="w-full border border-gray-600 rounded bg-black" />
            </div>
            <div>
              <p className="text-sm text-gray-300 mb-2">page.tsx 出力（Konva）</p>
              {previewDataUrl ? (
                <img src={previewDataUrl} alt="konva preview snapshot" className="w-full border border-gray-600 rounded bg-black" />
              ) : (
                <div className="w-full aspect-[16/9] border border-gray-600 rounded bg-black/40" />
              )}
            </div>
          </div>

          <div className="mb-4 border border-gray-700 rounded p-3 bg-gray-900/40">
            <p className="text-sm text-gray-300">全体平均差分: <span className="font-mono text-white">{totalDiff}</span></p>
            <p className="text-xs text-gray-500 mt-1">領域差分（大きい順）</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2 text-xs">
              {regionDiffs.map((r) => (
                <div key={r.name} className="bg-gray-800 rounded px-2 py-1">
                  <span className="text-gray-400">{r.name}:</span> <span className="font-mono">{r.diff}</span>
                </div>
              ))}
            </div>
          </div>

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
            scale={1}
            onRenderedDataUrl={setPreviewDataUrl}
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
