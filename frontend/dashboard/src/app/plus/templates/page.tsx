"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

type Guild = { id: string; name: string; icon: string | null };

type LayoutField = {
  x: number;
  y: number;
  size: number;
  visible: boolean;
};

type LayoutBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
};

type TextFieldKey = "title" | "members" | "time" | "content" | "voice";
type BoxFieldKey = "contentBox" | "imageBox";
type DraggableFieldKey = TextFieldKey | BoxFieldKey;

type DragState = {
  field: DraggableFieldKey;
  offsetX: number;
  offsetY: number;
};

type TemplateLayout = {
  canvas: { width: number; height: number };
  title: LayoutField;
  members: LayoutField;
  time: LayoutField;
  content: LayoutField;
  voice: LayoutField;
  contentBox: LayoutBox;
  imageBox: LayoutBox;
};

type Template = {
  guild_id: string;
  name: string;
  title: string | null;
  participants: number | null;
  color: string | null;
  content: string | null;
  start_time_text: string | null;
  voice_place: string | null;
  background_image_url: string | null;
  background_asset_key: string | null;
  layout_json: TemplateLayout | null;
  updated_at: string;
};

type FormState = {
  name: string;
  title: string;
  participants: string;
  color: string;
  content: string;
  startTimeText: string;
  voicePlace: string;
  backgroundImageUrl: string;
  backgroundAssetKey: string;
};

const DEFAULT_LAYOUT: TemplateLayout = {
  canvas: { width: 1280, height: 720 },
  title: { x: 420, y: 36, size: 64, visible: true },
  members: { x: 969, y: 302, size: 24, visible: true },
  time: { x: 969, y: 446, size: 24, visible: true },
  content: { x: 110, y: 389, size: 24, visible: true },
  voice: { x: 969, y: 590, size: 24, visible: true },
  contentBox: { x: 73, y: 281, width: 614, height: 360, visible: true },
  imageBox: { x: 880, y: 330, width: 300, height: 220, visible: false },
};

const INITIAL_FORM: FormState = {
  name: "",
  title: "募集タイトル",
  participants: "4",
  color: "#5865F2",
  content: "ガチエリア / 初心者歓迎",
  startTimeText: "今から",
  voicePlace: "通話あり",
  backgroundImageUrl: "",
  backgroundAssetKey: "",
};

const TEMPLATE_EDITOR_CACHE_PREFIX = "plus-template-editor-cache:";

function toForm(t: Template): FormState {
  return {
    name: t.name || "",
    title: t.title || "",
    participants: t.participants == null ? "" : String(t.participants),
    color: t.color ? `#${t.color}` : "",
    content: t.content || "",
    startTimeText: t.start_time_text || "",
    voicePlace: t.voice_place || "",
    backgroundImageUrl: t.background_image_url || "",
    backgroundAssetKey: t.background_asset_key || "",
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function parseLayout(input: unknown): TemplateLayout {
  if (!input || typeof input !== "object") return DEFAULT_LAYOUT;
  const raw = input as TemplateLayout;
  return {
    canvas: raw.canvas || DEFAULT_LAYOUT.canvas,
    title: raw.title || DEFAULT_LAYOUT.title,
    members: raw.members || DEFAULT_LAYOUT.members,
    time: raw.time || DEFAULT_LAYOUT.time,
    content: raw.content || DEFAULT_LAYOUT.content,
    voice: raw.voice || DEFAULT_LAYOUT.voice,
    contentBox: raw.contentBox || DEFAULT_LAYOUT.contentBox,
    imageBox: raw.imageBox || DEFAULT_LAYOUT.imageBox,
  };
}

export default function PlusTemplatePage() {
  const { user, login, isLoading } = useAuth();

  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingGuilds, setLoadingGuilds] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [layout, setLayout] = useState<TemplateLayout>(DEFAULT_LAYOUT);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.recrubo.net";

  useEffect(() => {
    if (!user) return;
    setLoadingGuilds(true);
    fetch(`${apiBaseUrl}/api/discord/guilds`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`guild fetch failed (${res.status})`);
        const data: Guild[] = await res.json();
        setGuilds(data);
        if (data.length > 0) setSelectedGuildId((prev) => prev || data[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "サーバー一覧の取得に失敗しました"))
      .finally(() => setLoadingGuilds(false));
  }, [user, apiBaseUrl]);

  const readEditorCache = (guildId: string): { form: FormState; layout: TemplateLayout } | null => {
    try {
      const raw = localStorage.getItem(`${TEMPLATE_EDITOR_CACHE_PREFIX}${guildId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const cachedForm = parsed.form && typeof parsed.form === "object" ? parsed.form : null;
      const cachedLayout = parsed.layout && typeof parsed.layout === "object" ? parsed.layout : null;
      if (!cachedForm || !cachedLayout) return null;
      return {
        form: { ...INITIAL_FORM, ...cachedForm },
        layout: parseLayout(cachedLayout),
      };
    } catch (_e) {
      return null;
    }
  };

  const writeEditorCache = (guildId: string, nextForm: FormState, nextLayout: TemplateLayout) => {
    try {
      localStorage.setItem(
        `${TEMPLATE_EDITOR_CACHE_PREFIX}${guildId}`,
        JSON.stringify({ form: nextForm, layout: nextLayout, updatedAt: Date.now() })
      );
    } catch (_e) {
      // no-op: localStorage quota or unavailable
    }
  };

  const reloadTemplates = async (guildId: string) => {
    setLoadingTemplates(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/plus/templates?guildId=${encodeURIComponent(guildId)}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `template fetch failed (${res.status})`);
      const list = Array.isArray(data?.templates) ? data.templates : [];
      setTemplates(list);

      // 1) guildごとの編集中キャッシュを優先
      const cached = readEditorCache(guildId);
      if (cached) {
        setForm(cached.form);
        setLayout(cached.layout);
        return;
      }

      // 2) キャッシュがなければ最新保存テンプレートを自動ロード
      if (list.length > 0) {
        const latest = list[0] as Template;
        const nextForm = toForm(latest);
        const nextLayout = parseLayout(latest.layout_json);
        setForm(nextForm);
        setLayout(nextLayout);
        writeEditorCache(guildId, nextForm, nextLayout);
      } else {
        // 3) 何もなければ初期値
        setForm(INITIAL_FORM);
        setLayout(DEFAULT_LAYOUT);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "テンプレート読み込みに失敗しました");
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    if (!selectedGuildId) return;
    reloadTemplates(selectedGuildId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGuildId]);

  useEffect(() => {
    if (!selectedGuildId) return;
    writeEditorCache(selectedGuildId, form, layout);
  }, [selectedGuildId, form, layout]);

  const selectedGuildName = guilds.find((g) => g.id === selectedGuildId)?.name || "";

  const toCanvasPoint = (clientX: number, clientY: number, canvasEl: HTMLElement | null) => {
    const rect = canvasEl?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;

    const px = clamp(clientX - rect.left, 0, rect.width);
    const py = clamp(clientY - rect.top, 0, rect.height);
    const x = Math.round((px / rect.width) * layout.canvas.width);
    const y = Math.round((py / rect.height) * layout.canvas.height);
    return { x, y };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onPointerDown = (field: DraggableFieldKey, e: any) => {
    e.preventDefault();
    const canvasEl = e.currentTarget?.closest?.('[data-preview-canvas="1"]') || null;
    const point = toCanvasPoint(e.clientX, e.clientY, canvasEl);
    if (!point) return;
    const target = layout[field];
    setDragState({
      field,
      offsetX: point.x - target.x,
      offsetY: point.y - target.y,
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onPointerMove = (e: any) => {
    if (!dragState) return;
    const point = toCanvasPoint(e.clientX, e.clientY, e.currentTarget);
    if (!point) return;

    setLayout((prev) => {
      const field = dragState.field;
      const target = prev[field];
      const nextXRaw = point.x - dragState.offsetX;
      const nextYRaw = point.y - dragState.offsetY;

      if (field === "contentBox" || field === "imageBox") {
        const box = target as LayoutBox;
        const maxX = Math.max(0, prev.canvas.width - box.width);
        const maxY = Math.max(0, prev.canvas.height - box.height);
        const x = clamp(nextXRaw, 0, maxX);
        const y = clamp(nextYRaw, 0, maxY);
        return {
          ...prev,
          [field]: { ...box, x, y },
        };
      }

      const text = target as LayoutField;
      const x = clamp(nextXRaw, 0, prev.canvas.width);
      const y = clamp(nextYRaw, 0, prev.canvas.height);
      return {
        ...prev,
        [field]: { ...text, x, y },
      };
    });
  };

  const onPointerUp = () => setDragState(null);

  const setFieldVisible = (field: TextFieldKey, visible: boolean) => {
    setLayout((prev) => ({ ...prev, [field]: { ...prev[field], visible } }));
  };

  const setFieldSize = (field: TextFieldKey, size: number) => {
    setLayout((prev) => ({ ...prev, [field]: { ...prev[field], size: clamp(size, 10, 128) } }));
  };

  const setBoxVisible = (field: BoxFieldKey, visible: boolean) => {
    setLayout((prev) => ({ ...prev, [field]: { ...prev[field], visible } }));
  };

  const setBoxSize = (field: BoxFieldKey, key: "width" | "height", value: number) => {
    setLayout((prev) => ({
      ...prev,
      [field]: { ...prev[field], [key]: clamp(value, 120, key === "width" ? 1200 : 620) },
    }));
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saveTemplate = async (e: any) => {
    e.preventDefault();
    if (!selectedGuildId) return;

    setSaving(true);
    setError(null);

    try {
      const payload = {
        guildId: selectedGuildId,
        ...form,
        layout,
      };

      const res = await fetch(`${apiBaseUrl}/api/plus/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "テンプレート保存に失敗しました");

      await reloadTemplates(selectedGuildId);
      writeEditorCache(selectedGuildId, form, layout);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const uploadBackground = async (file: File) => {
    if (!selectedGuildId) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("guildId", selectedGuildId);
      fd.set("templateName", form.name || "template");
      fd.set("file", file);

      const res = await fetch(`${apiBaseUrl}/api/plus/template-assets/upload`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "画像アップロードに失敗しました");

      setForm((prev) => ({
        ...prev,
        backgroundImageUrl: data?.publicUrl || prev.backgroundImageUrl,
        backgroundAssetKey: data?.objectKey || prev.backgroundAssetKey,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "画像アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (!user || !selectedGuildId) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch(`${apiBaseUrl}/api/plus/templates/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ guildId: selectedGuildId, form, layout }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "プレビュー生成に失敗しました");
        }

        const blob = await res.blob();
        const nextUrl = URL.createObjectURL(blob);
        setPreviewImageUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return nextUrl;
        });
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "プレビュー生成に失敗しました");
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [user, selectedGuildId, form, layout, apiBaseUrl]);

  if (isLoading) {
    return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">読み込み中...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <button className="px-5 py-3 bg-indigo-600 rounded-lg" onClick={() => login("/plus/templates")}>Discordでログイン</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-900 to-gray-900 text-white">
      <header className="border-b border-gray-700 bg-gray-800/40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Recrubo Plus 募集画像エディタ</h1>
          <Link href="/subscription" className="text-sm text-gray-300 hover:text-white">サブスク管理へ戻る</Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid lg:grid-cols-2 gap-6">
        <section className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="text-lg font-semibold">テンプレート設定</h2>

          {loadingGuilds ? <p className="text-sm text-gray-300">サーバー読み込み中...</p> : (
            <select
              value={selectedGuildId}
              onChange={(e) => setSelectedGuildId(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2"
            >
              {guilds.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          <p className="text-xs text-gray-400">対象サーバー: {selectedGuildName || "未選択"}</p>

          <form onSubmit={saveTemplate} className="space-y-3">
            <input className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2" placeholder="テンプレ名（保存キー）" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2" placeholder="募集タイトル" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <textarea className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 h-20" placeholder="募集内容" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />

            <div className="grid grid-cols-2 gap-3">
              <input className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2" placeholder="募集人数" value={form.participants} onChange={(e) => setForm({ ...form, participants: e.target.value })} />
              <input className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2" placeholder="開始時間" value={form.startTimeText} onChange={(e) => setForm({ ...form, startTimeText: e.target.value })} />
            </div>
            <input className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2" placeholder="通話表示（例: 通話あり）" value={form.voicePlace} onChange={(e) => setForm({ ...form, voicePlace: e.target.value })} />

            <div className="grid grid-cols-2 gap-3">
              <input className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2" placeholder="カード色 #RRGGBB" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
              <input className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2" placeholder="埋め込み画像URL（任意）" value={form.backgroundImageUrl} onChange={(e) => setForm({ ...form, backgroundImageUrl: e.target.value })} />
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-300">埋め込み画像アップロード:</label>
              <input type="file" accept="image/*" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadBackground(file);
              }} />
              {uploading && <span className="text-xs text-gray-300">アップロード中...</span>}
            </div>

            <div className="border border-gray-700 rounded-lg p-3 space-y-2">
              <p className="text-sm text-gray-300">表示要素ON/OFFと文字サイズ</p>
              {(["title", "members", "time", "content", "voice"] as const).map((field) => (
                <div key={field} className="grid grid-cols-3 gap-2 items-center text-sm">
                  <label className="capitalize">{field}</label>
                  <input
                    type="range"
                    min={12}
                    max={96}
                    value={layout[field].size}
                    onChange={(e) => setFieldSize(field, Number(e.target.value))}
                  />
                  <label className="flex items-center gap-2 justify-end">
                    <input
                      type="checkbox"
                      checked={layout[field].visible}
                      onChange={(e) => setFieldVisible(field, e.target.checked)}
                    />
                    表示
                  </label>
                </div>
              ))}

              <div className="pt-2 border-t border-gray-700 space-y-2">
                <p className="text-sm text-gray-300">内容枠・画像枠</p>

                <div className="grid grid-cols-3 gap-2 items-center text-sm">
                  <label>内容枠 幅</label>
                  <input type="range" min={180} max={1200} value={layout.contentBox.width} onChange={(e) => setBoxSize("contentBox", "width", Number(e.target.value))} />
                  <label className="flex items-center gap-2 justify-end">
                    <input type="checkbox" checked={layout.contentBox.visible} onChange={(e) => setBoxVisible("contentBox", e.target.checked)} />
                    表示
                  </label>
                </div>

                <div className="grid grid-cols-3 gap-2 items-center text-sm">
                  <label>内容枠 高さ</label>
                  <input type="range" min={140} max={620} value={layout.contentBox.height} onChange={(e) => setBoxSize("contentBox", "height", Number(e.target.value))} />
                  <span className="text-right text-xs text-gray-400">{layout.contentBox.width} x {layout.contentBox.height}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 items-center text-sm">
                  <label>画像枠 幅</label>
                  <input type="range" min={180} max={820} value={layout.imageBox.width} onChange={(e) => setBoxSize("imageBox", "width", Number(e.target.value))} />
                  <label className="flex items-center gap-2 justify-end">
                    <input type="checkbox" checked={layout.imageBox.visible} onChange={(e) => setBoxVisible("imageBox", e.target.checked)} />
                    表示
                  </label>
                </div>

                <div className="grid grid-cols-3 gap-2 items-center text-sm">
                  <label>画像枠 高さ</label>
                  <input type="range" min={140} max={620} value={layout.imageBox.height} onChange={(e) => setBoxSize("imageBox", "height", Number(e.target.value))} />
                  <span className="text-right text-xs text-gray-400">{layout.imageBox.width} x {layout.imageBox.height}</span>
                </div>
              </div>
            </div>

            <button type="submit" disabled={saving || !selectedGuildId} className="px-4 py-2 bg-white text-gray-900 rounded-lg font-semibold disabled:opacity-50">{saving ? "保存中..." : "テンプレ保存"}</button>
          </form>

          {error && <p className="text-sm text-red-300">{error}</p>}
        </section>

        <section className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="text-lg font-semibold">募集プレビュー（/rect 生成画像と同一レイアウト）</h2>

          <div
            data-preview-canvas="1"
            className="relative w-full overflow-hidden rounded-lg border border-gray-600 bg-black"
            style={{ aspectRatio: "7 / 5" }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            {previewImageUrl ? (
              <img src={previewImageUrl} alt="募集プレビュー" className="absolute inset-0 h-full w-full object-contain pointer-events-none" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-300">プレビュー生成待ち...</div>
            )}

            {previewLoading && (
              <div className="absolute right-3 top-3 rounded bg-black/70 px-2 py-1 text-xs text-white">更新中...</div>
            )}

            {layout.contentBox.visible && (
              <div
                className="absolute rounded-[28px] border-2 border-cyan-300/80 bg-cyan-400/10 cursor-move"
                style={{
                  left: `${(layout.contentBox.x / layout.canvas.width) * 100}%`,
                  top: `${(layout.contentBox.y / layout.canvas.height) * 100}%`,
                  width: `${(layout.contentBox.width / layout.canvas.width) * 100}%`,
                  height: `${(layout.contentBox.height / layout.canvas.height) * 100}%`,
                }}
                onPointerDown={(e) => onPointerDown("contentBox", e)}
              >
                <span className="absolute left-2 top-2 rounded bg-cyan-950/80 px-1.5 py-0.5 text-[10px] text-cyan-100">contentBox</span>
              </div>
            )}

            {layout.imageBox.visible && (
              <div
                className="absolute rounded-xl border-2 border-amber-300/80 bg-amber-400/10 cursor-move"
                style={{
                  left: `${(layout.imageBox.x / layout.canvas.width) * 100}%`,
                  top: `${(layout.imageBox.y / layout.canvas.height) * 100}%`,
                  width: `${(layout.imageBox.width / layout.canvas.width) * 100}%`,
                  height: `${(layout.imageBox.height / layout.canvas.height) * 100}%`,
                }}
                onPointerDown={(e) => onPointerDown("imageBox", e)}
              >
                <span className="absolute left-2 top-2 rounded bg-amber-950/80 px-1.5 py-0.5 text-[10px] text-amber-100">imageBox</span>
              </div>
            )}

            {([
              ["title", layout.title],
              ["members", layout.members],
              ["time", layout.time],
              ["content", layout.content],
              ["voice", layout.voice],
            ] as const).map(([fieldName, field]) => field.visible ? (
              <button
                key={fieldName}
                type="button"
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded border border-cyan-200 bg-cyan-950/80 px-2 py-1 text-[10px] text-cyan-50 cursor-move"
                style={{ left: `${(field.x / layout.canvas.width) * 100}%`, top: `${(field.y / layout.canvas.height) * 100}%` }}
                onPointerDown={(e) => onPointerDown(fieldName, e)}
              >
                {fieldName}
              </button>
            ) : null)}
          </div>

          <p className="text-xs text-gray-400">下の画像はサーバー側で bot と同じ描画関数から生成した PNG です。上に重ねたガイドをドラッグして座標を調整できます。</p>

          <div className="border border-gray-700 rounded-lg p-3">
            <h3 className="font-semibold mb-2">保存済みテンプレート</h3>
            {loadingTemplates ? (
              <p className="text-sm text-gray-300">読み込み中...</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-gray-400">テンプレートはまだありません</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-auto">
                {templates.map((t) => (
                  <button
                    key={`${t.guild_id}:${t.name}`}
                    type="button"
                    onClick={() => {
                      const nextForm = toForm(t);
                      const nextLayout = parseLayout(t.layout_json);
                      setForm(nextForm);
                      setLayout(nextLayout);
                      if (selectedGuildId) {
                        writeEditorCache(selectedGuildId, nextForm, nextLayout);
                      }
                    }}
                    className="w-full text-left border border-gray-700 rounded-lg p-3 hover:bg-gray-700/40 transition-colors"
                  >
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-sm text-gray-300">{t.title || "(タイトル未設定)"}</p>
                    <p className="text-xs text-gray-400 mt-1">更新: {new Date(t.updated_at).toLocaleString("ja-JP")}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
