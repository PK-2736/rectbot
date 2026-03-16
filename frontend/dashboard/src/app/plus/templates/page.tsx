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

type TemplateLayout = {
  canvas: { width: number; height: number };
  title: LayoutField;
  members: LayoutField;
  time: LayoutField;
  content: LayoutField;
  voice: LayoutField;
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
  title: { x: 140, y: 72, size: 56, visible: true },
  members: { x: 940, y: 120, size: 42, visible: true },
  time: { x: 940, y: 190, size: 36, visible: true },
  content: { x: 140, y: 220, size: 34, visible: true },
  voice: { x: 940, y: 260, size: 30, visible: true },
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
  const [error, setError] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<keyof Omit<TemplateLayout, "canvas"> | null>(null);

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

  const selectedGuildName = guilds.find((g) => g.id === selectedGuildId)?.name || "";

  const onPointerDown = (field: keyof Omit<TemplateLayout, "canvas">) => {
    setDragTarget(field);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onPointerMove = (e: any) => {
    if (!dragTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = clamp(e.clientX - rect.left, 0, rect.width);
    const py = clamp(e.clientY - rect.top, 0, rect.height);
    const x = Math.round((px / rect.width) * layout.canvas.width);
    const y = Math.round((py / rect.height) * layout.canvas.height);

    setLayout((prev) => ({
      ...prev,
      [dragTarget]: { ...prev[dragTarget], x, y },
    }));
  };

  const onPointerUp = () => setDragTarget(null);

  const setFieldVisible = (field: keyof Omit<TemplateLayout, "canvas">, visible: boolean) => {
    setLayout((prev) => ({ ...prev, [field]: { ...prev[field], visible } }));
  };

  const setFieldSize = (field: keyof Omit<TemplateLayout, "canvas">, size: number) => {
    setLayout((prev) => ({ ...prev, [field]: { ...prev[field], size: clamp(size, 10, 128) } }));
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
              <input className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2" placeholder="背景URL（任意）" value={form.backgroundImageUrl} onChange={(e) => setForm({ ...form, backgroundImageUrl: e.target.value })} />
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-300">背景画像アップロード:</label>
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
            </div>

            <button type="submit" disabled={saving || !selectedGuildId} className="px-4 py-2 bg-white text-gray-900 rounded-lg font-semibold disabled:opacity-50">{saving ? "保存中..." : "テンプレ保存"}</button>
          </form>

          {error && <p className="text-sm text-red-300">{error}</p>}
        </section>

        <section className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="text-lg font-semibold">Discordプレビュー（ドラッグで配置）</h2>
          <div
            className="relative w-full aspect-video rounded-lg overflow-hidden border border-gray-600 bg-black"
            style={{
              backgroundImage: form.backgroundImageUrl ? `url(${form.backgroundImageUrl})` : "none",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <div className="absolute inset-0 bg-black/25" />

            {layout.title.visible && (
              <div
                className="absolute px-2 py-1 rounded bg-black/45 border border-white/20 cursor-move"
                style={{ left: `${(layout.title.x / layout.canvas.width) * 100}%`, top: `${(layout.title.y / layout.canvas.height) * 100}%`, fontSize: `${layout.title.size / 3}px` }}
                onPointerDown={() => onPointerDown("title")}
              >
                {form.title || "募集タイトル"}
              </div>
            )}

            {layout.members.visible && (
              <div
                className="absolute px-2 py-1 rounded bg-black/45 border border-white/20 cursor-move"
                style={{ left: `${(layout.members.x / layout.canvas.width) * 100}%`, top: `${(layout.members.y / layout.canvas.height) * 100}%`, fontSize: `${layout.members.size / 3}px` }}
                onPointerDown={() => onPointerDown("members")}
              >
                👥 {form.participants || "4"}人
              </div>
            )}

            {layout.time.visible && (
              <div
                className="absolute px-2 py-1 rounded bg-black/45 border border-white/20 cursor-move"
                style={{ left: `${(layout.time.x / layout.canvas.width) * 100}%`, top: `${(layout.time.y / layout.canvas.height) * 100}%`, fontSize: `${layout.time.size / 3}px` }}
                onPointerDown={() => onPointerDown("time")}
              >
                🕒 {form.startTimeText || "今から"}
              </div>
            )}

            {layout.voice.visible && (
              <div
                className="absolute px-2 py-1 rounded bg-black/45 border border-white/20 cursor-move"
                style={{ left: `${(layout.voice.x / layout.canvas.width) * 100}%`, top: `${(layout.voice.y / layout.canvas.height) * 100}%`, fontSize: `${layout.voice.size / 3}px` }}
                onPointerDown={() => onPointerDown("voice")}
              >
                🎙 {form.voicePlace || "通話あり"}
              </div>
            )}

            {layout.content.visible && (
              <div
                className="absolute px-2 py-1 rounded bg-black/45 border border-white/20 cursor-move max-w-[70%]"
                style={{ left: `${(layout.content.x / layout.canvas.width) * 100}%`, top: `${(layout.content.y / layout.canvas.height) * 100}%`, fontSize: `${layout.content.size / 3}px` }}
                onPointerDown={() => onPointerDown("content")}
              >
                {form.content || "募集内容を入力"}
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400">要素をドラッグして配置すると、座標がそのままテンプレに保存されます。</p>

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
                      setForm(toForm(t));
                      setLayout(parseLayout(t.layout_json));
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
