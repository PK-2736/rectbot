"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import RecruitCardCanvas from "@/components/RecruitCardCanvas";

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

type BoxFieldKey = "contentBox" | "imageBox" | "participantsBox";
type InfoBoxFieldKey = "membersBox" | "timeBox" | "voiceBox";
type LayoutColorKey = "contentBoxColor" | "imageBoxColor" | "participantsBoxColor" | "membersBoxColor" | "timeBoxColor" | "voiceBoxColor";

type TemplateLayout = {
  canvas: { width: number; height: number };
  outputScale: number;
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
  participantsBox: LayoutBox;
  contentBoxColor: string;
  imageBoxColor: string;
  participantsBoxColor: string;
  membersBoxColor: string;
  timeBoxColor: string;
  voiceBoxColor: string;
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
  text_color: string | null;
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
  textColor: string;
  content: string;
  startTimeText: string;
  voicePlace: string;
  backgroundImageUrl: string;
  backgroundAssetKey: string;
};

const DEFAULT_LAYOUT: TemplateLayout = {
  canvas: { width: 1280, height: 720 },
  outputScale: 5,
  contentLabel: "募集内容",
  membersLabel: "人数：",
  timeLabel: "時間：",
  voiceLabel: "通話：",
  title: { x: 420, y: 36, size: 64, visible: true },
  members: { x: 969, y: 302, size: 24, visible: true },
  time: { x: 969, y: 446, size: 24, visible: true },
  content: { x: 110, y: 389, size: 24, visible: true },
  voice: { x: 969, y: 590, size: 24, visible: true },
  contentBox: { x: 73, y: 281, width: 614, height: 360, visible: true },
  imageBox: { x: 880, y: 330, width: 300, height: 220, visible: false },
  membersBox: { x: 969, y: 302, width: 120, height: 20, visible: true },
  timeBox: { x: 969, y: 446, width: 120, height: 20, visible: true },
  voiceBox: { x: 969, y: 590, width: 120, height: 20, visible: true },
  participantsBox: { x: 119, y: 180, width: 1134, height: 158, visible: true },
  contentBoxColor: "#FFFFFF",
  imageBoxColor: "#FFFFFF",
  participantsBoxColor: "#FFFFFF",
  membersBoxColor: "#FFFFFF",
  timeBoxColor: "#FFFFFF",
  voiceBoxColor: "#FFFFFF",
};

const INITIAL_FORM: FormState = {
  name: "",
  title: "募集タイトル",
  participants: "4",
  color: "#FFFFFF",
  textColor: "#FFFFFF",
  content: "ガチエリア / 初心者歓迎",
  startTimeText: "今から",
  voicePlace: "通話あり",
  backgroundImageUrl: "",
  backgroundAssetKey: "",
};

const TEMPLATE_EDITOR_CACHE_PREFIX = "plus-template-editor-cache:";
const DEFAULT_ACCENT_COLOR = "FFFFFF";

function toForm(t: Template): FormState {
  return {
    name: t.name || "",
    title: t.title || "",
    participants: t.participants == null ? "" : String(t.participants),
    color: t.color ? `#${t.color}` : "",
    textColor: t.text_color ? `#${t.text_color}` : "#FFFFFF",
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
    outputScale: clamp(Number((raw as { outputScale?: number }).outputScale ?? DEFAULT_LAYOUT.outputScale), 2, 10),
    contentLabel: typeof (raw as { contentLabel?: string }).contentLabel === 'string' ? (raw as { contentLabel?: string }).contentLabel || DEFAULT_LAYOUT.contentLabel : DEFAULT_LAYOUT.contentLabel,
    membersLabel: typeof (raw as { membersLabel?: string }).membersLabel === 'string' ? (raw as { membersLabel?: string }).membersLabel || DEFAULT_LAYOUT.membersLabel : DEFAULT_LAYOUT.membersLabel,
    timeLabel: typeof (raw as { timeLabel?: string }).timeLabel === 'string' ? (raw as { timeLabel?: string }).timeLabel || DEFAULT_LAYOUT.timeLabel : DEFAULT_LAYOUT.timeLabel,
    voiceLabel: typeof (raw as { voiceLabel?: string }).voiceLabel === 'string' ? (raw as { voiceLabel?: string }).voiceLabel || DEFAULT_LAYOUT.voiceLabel : DEFAULT_LAYOUT.voiceLabel,
    title: raw.title || DEFAULT_LAYOUT.title,
    members: raw.members || DEFAULT_LAYOUT.members,
    time: raw.time || DEFAULT_LAYOUT.time,
    content: raw.content || DEFAULT_LAYOUT.content,
    voice: raw.voice || DEFAULT_LAYOUT.voice,
    contentBox: raw.contentBox || DEFAULT_LAYOUT.contentBox,
    imageBox: raw.imageBox || DEFAULT_LAYOUT.imageBox,
    membersBox: raw.membersBox || DEFAULT_LAYOUT.membersBox,
    timeBox: raw.timeBox || DEFAULT_LAYOUT.timeBox,
    voiceBox: raw.voiceBox || DEFAULT_LAYOUT.voiceBox,
    participantsBox: raw.participantsBox || DEFAULT_LAYOUT.participantsBox,
    contentBoxColor: typeof (raw as { contentBoxColor?: string }).contentBoxColor === 'string' ? (raw as { contentBoxColor?: string }).contentBoxColor || DEFAULT_LAYOUT.contentBoxColor : DEFAULT_LAYOUT.contentBoxColor,
    imageBoxColor: typeof (raw as { imageBoxColor?: string }).imageBoxColor === 'string' ? (raw as { imageBoxColor?: string }).imageBoxColor || DEFAULT_LAYOUT.imageBoxColor : DEFAULT_LAYOUT.imageBoxColor,
    participantsBoxColor: typeof (raw as { participantsBoxColor?: string }).participantsBoxColor === 'string' ? (raw as { participantsBoxColor?: string }).participantsBoxColor || DEFAULT_LAYOUT.participantsBoxColor : DEFAULT_LAYOUT.participantsBoxColor,
    membersBoxColor: typeof (raw as { membersBoxColor?: string }).membersBoxColor === 'string' ? (raw as { membersBoxColor?: string }).membersBoxColor || DEFAULT_LAYOUT.membersBoxColor : DEFAULT_LAYOUT.membersBoxColor,
    timeBoxColor: typeof (raw as { timeBoxColor?: string }).timeBoxColor === 'string' ? (raw as { timeBoxColor?: string }).timeBoxColor || DEFAULT_LAYOUT.timeBoxColor : DEFAULT_LAYOUT.timeBoxColor,
    voiceBoxColor: typeof (raw as { voiceBoxColor?: string }).voiceBoxColor === 'string' ? (raw as { voiceBoxColor?: string }).voiceBoxColor || DEFAULT_LAYOUT.voiceBoxColor : DEFAULT_LAYOUT.voiceBoxColor,
  };
}

export default function PlusTemplatePage() {
  const { user, login, isLoading } = useAuth();
  const [guestGuildId, setGuestGuildId] = useState("");
  const [guestToken, setGuestToken] = useState("");
  const isGuestMode = !!guestGuildId && !!guestToken;
  const hasGuildOnlyLink = !!guestGuildId && !guestToken;

  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingGuilds, setLoadingGuilds] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [selectedFileName, setSelectedFileName] = useState<string>("");
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [layout, setLayout] = useState<TemplateLayout>(DEFAULT_LAYOUT);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const localPreviewUrlRef = useRef<string | null>(null);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.recrubo.net";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search || "");
    setGuestGuildId(String(params.get("guildId") || "").trim());
    setGuestToken(String(params.get("guestToken") || "").trim());
  }, []);

  const guestHeaders = () => {
    if (!isGuestMode) return undefined;
    return { "x-template-guest-token": guestToken };
  };

  useEffect(() => {
    if (isGuestMode) {
      setSelectedGuildId(guestGuildId);
      setGuilds([{ id: guestGuildId, name: `固定サーバー (${guestGuildId})`, icon: null }]);
      setLoadingGuilds(false);
      return;
    }

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
  }, [user, apiBaseUrl, isGuestMode, guestGuildId]);

  const readEditorCache = (guildId: string): { form: FormState; layout: TemplateLayout } | null => {
    try {
      const raw = localStorage.getItem(`${TEMPLATE_EDITOR_CACHE_PREFIX}${guildId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const cachedForm = parsed.form && typeof parsed.form === "object" ? parsed.form : null;
      const cachedLayout = parsed.layout && typeof parsed.layout === "object" ? parsed.layout : null;
      if (!cachedForm || !cachedLayout) return null;
      // blob: URLはページをリロードすると無効化されるので、キャッシュから削除
      const sanitizedForm = { ...INITIAL_FORM, ...cachedForm };
      if (sanitizedForm.backgroundImageUrl?.startsWith('blob:')) {
        sanitizedForm.backgroundImageUrl = "";
      }
      return {
        form: sanitizedForm,
        layout: parseLayout(cachedLayout),
      };
    } catch {
      return null;
    }
  };

  const writeEditorCache = (guildId: string, nextForm: FormState, nextLayout: TemplateLayout) => {
    try {
      // blob: URLはキャッシュに保存しない（リロード後に無効化されるため）
      const sanitizedForm = { ...nextForm };
      if (sanitizedForm.backgroundImageUrl?.startsWith('blob:')) {
        sanitizedForm.backgroundImageUrl = "";
      }
      localStorage.setItem(
        `${TEMPLATE_EDITOR_CACHE_PREFIX}${guildId}`,
        JSON.stringify({ form: sanitizedForm, layout: nextLayout, updatedAt: Date.now() })
      );
    } catch {
      // no-op: localStorage quota or unavailable
    }
  };

  const reloadTemplates = async (guildId: string) => {
    setLoadingTemplates(true);
    try {
      const listUrl = `${apiBaseUrl}/api/plus/templates?guildId=${encodeURIComponent(guildId)}${isGuestMode ? `&guestToken=${encodeURIComponent(guestToken)}` : ''}`;
      const res = await fetch(listUrl, {
        credentials: isGuestMode ? "omit" : "include",
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

  useEffect(() => {
    return () => {
      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current);
        localPreviewUrlRef.current = null;
      }
    };
  }, []);

  const selectedGuildName = guilds.find((g) => g.id === selectedGuildId)?.name || "";
  const templateExists = templates.some((t) => t.name === form.name.trim());
  const canCreateNewTemplate = templateExists || templates.length < 5;

  const setBoxVisible = (field: BoxFieldKey, visible: boolean) => {
    setLayout((prev) => ({ ...prev, [field]: { ...prev[field], visible } }));
  };

  const setBoxSize = (field: BoxFieldKey, key: "width" | "height", value: number) => {
    setLayout((prev) => ({
      ...prev,
      [field]: { ...prev[field], [key]: clamp(value, 120, key === "width" ? 1200 : 620) },
    }));
  };

  const setInfoBoxVisible = (field: InfoBoxFieldKey, visible: boolean) => {
    setLayout((prev) => ({ ...prev, [field]: { ...prev[field], visible } }));
  };

  const setInfoBoxSize = (field: InfoBoxFieldKey, key: "width" | "height", value: number) => {
    setLayout((prev) => ({
      ...prev,
      [field]: { ...prev[field], [key]: clamp(value, key === "width" ? 48 : 12, key === "width" ? 640 : 160) },
    }));
  };

  const setLayoutText = (key: "contentLabel" | "membersLabel" | "timeLabel" | "voiceLabel", value: string) => {
    setLayout((prev) => ({ ...prev, [key]: value }));
  };

  const setLayoutColor = (key: LayoutColorKey, value: string) => {
    setLayout((prev) => ({ ...prev, [key]: value }));
  };

  const uploadBackgroundFile = async (file: File, guildId: string, templateName: string) => {
    const fd = new FormData();
    fd.set("guildId", guildId);
    fd.set("templateName", templateName);
    fd.set("file", file);

    const res = await fetch(`${apiBaseUrl}/api/plus/template-assets/upload`, {
      method: "POST",
        credentials: isGuestMode ? "omit" : "include",
        headers: guestHeaders(),
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`${data?.error || "画像アップロードに失敗しました"} (status: ${res.status})`);
    }
    return data;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saveTemplate = async (e: any) => {
    e.preventDefault();
    if (!selectedGuildId) return;

    setSaving(true);
    setError(null);
    setUploadStatus("");

    try {
      let nextForm = form;
      if (!form.name.trim()) {
        throw new Error("先にテンプレ名を入力してください");
      }

      if (!templateExists && templates.length >= 5) {
        throw new Error("テンプレートは1サーバーにつき5個までです。不要なテンプレートを削除してください。");
      }

      const uploadSourceFile = selectedUploadFile;

      if (uploadSourceFile) {
        const uploadData = await uploadBackgroundFile(uploadSourceFile, selectedGuildId, form.name.trim());
        nextForm = {
          ...form,
          backgroundImageUrl: uploadData?.publicUrl || form.backgroundImageUrl,
          backgroundAssetKey: uploadData?.objectKey || form.backgroundAssetKey,
        };
        setForm(nextForm);
        setSelectedFileName("");
        setSelectedUploadFile(null);
        setUploadStatus(`ステッカー画像を保存しました: ${String(uploadData?.objectKey || "(key不明)")}`);
        if (uploadInputRef.current) uploadInputRef.current.value = "";
        if (localPreviewUrlRef.current) {
          URL.revokeObjectURL(localPreviewUrlRef.current);
          localPreviewUrlRef.current = null;
        }
      }

      const payload = {
        guildId: selectedGuildId,
        ...nextForm,
        layout,
      };

      const res = await fetch(`${apiBaseUrl}/api/plus/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(guestHeaders() || {}) },
        credentials: isGuestMode ? "omit" : "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "テンプレート保存に失敗しました");

      await reloadTemplates(selectedGuildId);
      writeEditorCache(selectedGuildId, nextForm, layout);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (templateName: string) => {
    if (!selectedGuildId || !templateName) return;
    if (!window.confirm(`テンプレート「${templateName}」を削除しますか？`)) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/plus/templates`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...(guestHeaders() || {}) },
        credentials: isGuestMode ? "omit" : "include",
        body: JSON.stringify({ guildId: selectedGuildId, name: templateName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "テンプレート削除に失敗しました");

      if (form.name.trim() === templateName) {
        setForm(INITIAL_FORM);
        setLayout(DEFAULT_LAYOUT);
      }
      await reloadTemplates(selectedGuildId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  if (!isGuestMode && isLoading) {
    return <div className="min-h-screen bg-gradient-to-b from-amber-50 via-rose-50 to-white text-stone-700 flex items-center justify-center">読み込み中...</div>;
  }

  if (!isGuestMode && !user) {
    if (hasGuildOnlyLink) {
      return (
        <div className="min-h-screen bg-gradient-to-b from-amber-50 via-rose-50 to-white flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white/90 p-6 shadow-sm text-center space-y-3">
            <h1 className="text-lg font-semibold text-stone-900">リンクが不完全です</h1>
            <p className="text-sm text-stone-600">このURLにはゲストトークンが含まれていないため、ログインなしで編集できません。</p>
            <p className="text-xs text-stone-500">Discord の「カスタマイズページを開く」ボタンから再度開いてください。</p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 via-rose-50 to-white flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white/90 p-6 shadow-sm text-center space-y-3">
          <h1 className="text-lg font-semibold text-stone-900">募集画像テンプレートを編集</h1>
          <p className="text-sm text-stone-600">続行するにはDiscordアカウントでログインしてください。</p>
          <button className="w-full px-5 py-3 bg-brand-500 hover:bg-brand-400 text-white rounded-xl font-semibold" onClick={() => login("/plus/templates")}>Discordでログイン</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-rose-50 to-white text-stone-800">
      <header className="border-b border-amber-200/80 bg-white/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-stone-900">募集画像エディタ</h1>
            <p className="text-xs sm:text-sm text-stone-600">必要な設定だけ調整して、そのままテンプレート保存できます。</p>
          </div>
          <Link href="/subscription" className="text-sm text-brand-700 hover:text-brand-900">サブスク管理へ戻る</Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 lg:py-8 grid xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] gap-6 items-start">
        <section className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-white/90 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-stone-900">テンプレート設定</h2>
            <p className="mt-1 text-sm text-stone-600">最小限の項目だけ上から入力すると、右側プレビューに即反映されます。</p>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-stone-600 mb-2">対象サーバー</label>
              {loadingGuilds ? (
                <p className="text-sm text-stone-500">サーバー読み込み中...</p>
              ) : (
                <select
                  value={selectedGuildId}
                  onChange={(e) => setSelectedGuildId(e.target.value)}
                  disabled={isGuestMode}
                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-800"
                >
                  {guilds.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              )}
              <p className="mt-2 text-xs text-stone-500">対象サーバー: {selectedGuildName || "未選択"}</p>
            </div>
          </div>

          <form onSubmit={saveTemplate} className="space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-white/90 p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-semibold text-stone-900">基本情報</h3>
              <input className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm" placeholder="テンプレ名（保存キー）" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <input className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm" placeholder="募集タイトル" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <textarea className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm h-24" placeholder="募集内容" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
              <div className="grid sm:grid-cols-2 gap-3">
                <input className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm" placeholder="募集人数" value={form.participants} onChange={(e) => setForm({ ...form, participants: e.target.value })} />
                <input className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm" placeholder="開始時間" value={form.startTimeText} onChange={(e) => setForm({ ...form, startTimeText: e.target.value })} />
              </div>
              <input className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm" placeholder="通話表示（例: 通話あり）" value={form.voicePlace} onChange={(e) => setForm({ ...form, voicePlace: e.target.value })} />
            </div>

            <div className="rounded-2xl border border-amber-200 bg-white/90 p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-semibold text-stone-900">ラベルと配色</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <input className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm" placeholder="内容ラベル" value={layout.contentLabel} onChange={(e) => setLayoutText("contentLabel", e.target.value)} />
                <input className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm" placeholder="人数ラベル" value={layout.membersLabel} onChange={(e) => setLayoutText("membersLabel", e.target.value)} />
                <input className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm" placeholder="時間ラベル" value={layout.timeLabel} onChange={(e) => setLayoutText("timeLabel", e.target.value)} />
                <input className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm" placeholder="通話ラベル" value={layout.voiceLabel} onChange={(e) => setLayoutText("voiceLabel", e.target.value)} />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2">
                  <label htmlFor="frame-color-picker" className="text-xs text-stone-600 whitespace-nowrap">外枠色</label>
                  <input
                    id="frame-color-picker"
                    type="color"
                    className="h-8 w-full cursor-pointer bg-transparent"
                    value={form.color || "#FFFFFF"}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2">
                  <label htmlFor="text-color-picker" className="text-xs text-stone-600 whitespace-nowrap">文字色</label>
                  <input
                    id="text-color-picker"
                    type="color"
                    className="h-8 w-full cursor-pointer bg-transparent"
                    value={form.textColor || "#FFFFFF"}
                    onChange={(e) => setForm({ ...form, textColor: e.target.value })}
                  />
                </div>
                <input className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm" placeholder="ステッカー画像URL（任意）" value={form.backgroundImageUrl} onChange={(e) => setForm({ ...form, backgroundImageUrl: e.target.value })} />
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-white/90 p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-semibold text-stone-900">ステッカー画像</h3>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <label className="text-sm text-stone-600">画像アップロード:</label>
                <input ref={uploadInputRef} type="file" accept="image/*" onClick={(e) => {
                  (e.currentTarget as HTMLInputElement).value = "";
                }} onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) {
                    setError("画像ファイルを選択してください");
                    setSelectedFileName("");
                    setSelectedUploadFile(null);
                    return;
                  }
                  setError(null);
                  setUploadStatus("");
                  setSelectedFileName(file.name || "(file)");
                  setSelectedUploadFile(file);

                  if (localPreviewUrlRef.current) {
                    URL.revokeObjectURL(localPreviewUrlRef.current);
                  }
                  const localUrl = URL.createObjectURL(file);
                  localPreviewUrlRef.current = localUrl;
                  setForm((prev) => ({
                    ...prev,
                    backgroundImageUrl: localUrl,
                    backgroundAssetKey: "",
                  }));
                }} />
                {saving && <span className="text-xs text-stone-500">アップロード中...</span>}
              </div>
              {selectedFileName && <p className="text-xs text-brand-700">選択中: {selectedFileName}（保存時にR2へ保存）</p>}
              {uploadStatus && <p className="text-xs text-emerald-600">{uploadStatus}</p>}
            </div>

            <details className="rounded-2xl border border-amber-200 bg-white/90 p-5 shadow-sm" open>
              <summary className="cursor-pointer select-none text-sm font-semibold text-stone-900">表示要素とサイズ調整</summary>
              <div className="mt-3 space-y-4">
                <div className="space-y-2 rounded-xl border border-amber-100 p-3">
                  <p className="text-sm text-stone-700">内容枠・ステッカー枠</p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center text-sm">
                    <label>内容枠 幅</label>
                    <input type="range" min={180} max={1200} value={layout.contentBox.width} onChange={(e) => setBoxSize("contentBox", "width", Number(e.target.value))} />
                    <label className="flex items-center gap-2 sm:justify-end">
                      <input type="checkbox" checked={layout.contentBox.visible} onChange={(e) => setBoxVisible("contentBox", e.target.checked)} />
                      表示
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center text-sm">
                    <label>内容枠 高さ</label>
                    <input type="range" min={140} max={620} value={layout.contentBox.height} onChange={(e) => setBoxSize("contentBox", "height", Number(e.target.value))} />
                    <span className="sm:text-right text-xs text-stone-500">{layout.contentBox.width} x {layout.contentBox.height}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center text-sm">
                    <label>ステッカー枠 幅</label>
                    <input type="range" min={180} max={820} value={layout.imageBox.width} onChange={(e) => setBoxSize("imageBox", "width", Number(e.target.value))} />
                    <label className="flex items-center gap-2 sm:justify-end">
                      <input type="checkbox" checked={layout.imageBox.visible} onChange={(e) => setBoxVisible("imageBox", e.target.checked)} />
                      表示
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center text-sm">
                    <label>ステッカー枠 高さ</label>
                    <input type="range" min={140} max={620} value={layout.imageBox.height} onChange={(e) => setBoxSize("imageBox", "height", Number(e.target.value))} />
                    <span className="sm:text-right text-xs text-stone-500">{layout.imageBox.width} x {layout.imageBox.height}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center text-sm">
                    <label>募集画像サイズ</label>
                    <input
                      type="range"
                      min={2}
                      max={10}
                      step={1}
                      value={layout.outputScale}
                      onChange={(e) => setLayout((prev) => ({ ...prev, outputScale: clamp(Number(e.target.value), 2, 10) }))}
                    />
                    <span className="sm:text-right text-xs text-stone-500">{layout.outputScale}x</span>
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border border-amber-100 p-3">
                  <p className="text-sm text-stone-700">枠色（種類別）</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <label className="space-y-1 text-xs text-stone-600">
                      <span>内容枠</span>
                      <input type="color" className="h-9 w-full cursor-pointer rounded-lg border border-amber-200 bg-white" value={layout.contentBoxColor} onChange={(e) => setLayoutColor("contentBoxColor", e.target.value)} />
                    </label>
                    <label className="space-y-1 text-xs text-stone-600">
                      <span>画像枠</span>
                      <input type="color" className="h-9 w-full cursor-pointer rounded-lg border border-amber-200 bg-white" value={layout.imageBoxColor} onChange={(e) => setLayoutColor("imageBoxColor", e.target.value)} />
                    </label>
                    <label className="space-y-1 text-xs text-stone-600">
                      <span>参加枠</span>
                      <input type="color" className="h-9 w-full cursor-pointer rounded-lg border border-amber-200 bg-white" value={layout.participantsBoxColor} onChange={(e) => setLayoutColor("participantsBoxColor", e.target.value)} />
                    </label>
                    <label className="space-y-1 text-xs text-stone-600">
                      <span>人数枠</span>
                      <input type="color" className="h-9 w-full cursor-pointer rounded-lg border border-amber-200 bg-white" value={layout.membersBoxColor} onChange={(e) => setLayoutColor("membersBoxColor", e.target.value)} />
                    </label>
                    <label className="space-y-1 text-xs text-stone-600">
                      <span>時間枠</span>
                      <input type="color" className="h-9 w-full cursor-pointer rounded-lg border border-amber-200 bg-white" value={layout.timeBoxColor} onChange={(e) => setLayoutColor("timeBoxColor", e.target.value)} />
                    </label>
                    <label className="space-y-1 text-xs text-stone-600">
                      <span>通話枠</span>
                      <input type="color" className="h-9 w-full cursor-pointer rounded-lg border border-amber-200 bg-white" value={layout.voiceBoxColor} onChange={(e) => setLayoutColor("voiceBoxColor", e.target.value)} />
                    </label>
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border border-amber-100 p-3">
                  <p className="text-sm text-stone-700">人数・時間・通話ラベル枠</p>
                  {([
                    ["membersBox", "人数"],
                    ["timeBox", "時間"],
                    ["voiceBox", "通話"],
                  ] as const).map(([field, label]) => (
                    <div key={field} className="space-y-2 rounded-lg border border-amber-100 p-2">
                      <div className="flex items-center justify-between text-xs text-stone-600">
                        <span>{label}ラベル枠</span>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={layout[field].visible} onChange={(e) => setInfoBoxVisible(field, e.target.checked)} />
                          表示
                        </label>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center text-sm">
                        <label>幅</label>
                        <input type="range" min={48} max={640} value={layout[field].width} onChange={(e) => setInfoBoxSize(field, "width", Number(e.target.value))} />
                        <span className="sm:text-right text-xs text-stone-500">{layout[field].width}px</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center text-sm">
                        <label>高さ</label>
                        <input type="range" min={12} max={160} value={layout[field].height} onChange={(e) => setInfoBoxSize(field, "height", Number(e.target.value))} />
                        <span className="sm:text-right text-xs text-stone-500">{layout[field].height}px</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </details>

            <div className="rounded-2xl border border-amber-200 bg-white/90 p-5 shadow-sm space-y-3">
              <button type="submit" disabled={saving || !selectedGuildId || !canCreateNewTemplate} className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-semibold disabled:opacity-50">{saving ? "保存中..." : "テンプレ保存"}</button>
              {!canCreateNewTemplate && <p className="text-xs text-amber-700">テンプレートは1サーバーにつき5個までです。不要なものを削除してください。</p>}
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          </form>
        </section>

        <section className="space-y-4 xl:sticky xl:top-6">
          <div className="rounded-2xl border border-amber-200 bg-white/90 p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-stone-900">募集プレビュー</h2>
              <span className="text-xs text-stone-500">表示倍率: 100%</span>
            </div>

            <div className="overflow-hidden rounded-xl border border-amber-200 bg-stone-950/95">
              <RecruitCardCanvas
                recruitData={{
                  title: form.title || '募集タイトル',
                  content: form.content || 'ガチエリア / 初心者歓迎',
                  participants: parseInt(form.participants) || 4,
                  startTimeText: form.startTimeText || '今から',
                  voicePlace: form.voicePlace || '',
                }}
                layout={layout}
                accentColor={form.color ? form.color.replace('#', '') : DEFAULT_ACCENT_COLOR}
                textColor={form.textColor}
                backgroundImageUrl={form.backgroundImageUrl || undefined}
                scale={1}
                onLayoutChange={(fieldName: string, newX: number, newY: number) => {
                  const field = fieldName as keyof TemplateLayout;
                  setLayout((prev) => {
                    const next = JSON.parse(JSON.stringify(prev)) as TemplateLayout;
                    const item = next[field];
                    if (item && typeof item === 'object' && 'x' in item && 'y' in item) {
                      (item as { x: number; y: number }).x = newX;
                      (item as { x: number; y: number }).y = newY;
                    }
                    return next;
                  });
                }}
              />
            </div>

            <p className="text-xs text-stone-500">テキストやボックスはドラッグして位置調整できます。</p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-white/90 p-4 sm:p-5 shadow-sm">
            <h3 className="font-semibold text-stone-900 mb-3 text-sm">保存済みテンプレート</h3>
            {loadingTemplates ? (
              <p className="text-sm text-stone-500">読み込み中...</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-stone-500">テンプレートはまだありません</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-auto pr-1">
                {templates.map((t) => (
                  <div key={`${t.guild_id}:${t.name}`} className="w-full border border-amber-200 rounded-xl p-3 bg-amber-50/50">
                    <button
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
                      className="w-full text-left"
                    >
                      <p className="font-semibold text-stone-900">{t.name}</p>
                      <p className="text-sm text-stone-600">{t.title || "(タイトル未設定)"}</p>
                      <p className="text-xs text-stone-500 mt-1">更新: {new Date(t.updated_at).toLocaleString("ja-JP")}</p>
                    </button>
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => deleteTemplate(t.name)}
                        className="px-3 py-1 text-xs rounded-md bg-rose-500 hover:bg-rose-400 text-white"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
