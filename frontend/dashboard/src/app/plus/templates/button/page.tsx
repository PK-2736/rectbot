"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

type Guild = { id: string; name: string; icon?: string | null };
type Template = { name: string };
type Channel = { id: string; name: string; type: number; parentId?: string | null };
type ButtonStyle = "primary" | "secondary" | "success" | "danger";

type TemplateButtonConfig = {
  templateName: string;
  buttonLabel: string;
  buttonStyle: ButtonStyle;
  embedTitle: string;
  embedDescription: string;
  channelId: string;
};

const DEFAULT_CONFIG: TemplateButtonConfig = {
  templateName: "",
  buttonLabel: "募集を作成",
  buttonStyle: "primary",
  embedTitle: "募集作成",
  embedDescription: "下のボタンから募集を作成できます。",
  channelId: "",
};

function normalizeButtonStyle(value: unknown): ButtonStyle {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "secondary" || normalized === "success" || normalized === "danger") {
    return normalized;
  }
  return "primary";
}

function toConfig(input: unknown): TemplateButtonConfig {
  if (!input || typeof input !== "object") return DEFAULT_CONFIG;
  const raw = input as Record<string, unknown>;
  return {
    templateName: String(raw.templateName || "").trim(),
    buttonLabel: String(raw.buttonLabel || DEFAULT_CONFIG.buttonLabel).trim() || DEFAULT_CONFIG.buttonLabel,
    buttonStyle: normalizeButtonStyle(raw.buttonStyle),
    embedTitle: String(raw.embedTitle || DEFAULT_CONFIG.embedTitle).trim() || DEFAULT_CONFIG.embedTitle,
    embedDescription: String(raw.embedDescription || DEFAULT_CONFIG.embedDescription).trim() || DEFAULT_CONFIG.embedDescription,
    channelId: String(raw.channelId || "").trim(),
  };
}

export default function TemplateButtonPage() {
  const { user, login, isLoading } = useAuth();
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.recrubo.net";

  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [config, setConfig] = useState<TemplateButtonConfig>(DEFAULT_CONFIG);

  const [isLoadingGuilds, setIsLoadingGuilds] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    const loadGuilds = async () => {
      setIsLoadingGuilds(true);
      setError(null);
      try {
        const res = await fetch(`${apiBaseUrl}/api/discord/guilds?premiumOnly=1`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => []);
        if (!res.ok) throw new Error((data && data.error) || "サーバー一覧の取得に失敗しました");

        const nextGuilds = Array.isArray(data) ? data : [];
        if (!mounted) return;

        setGuilds(nextGuilds);
        if (nextGuilds.length > 0) {
          setSelectedGuildId(nextGuilds[0].id);
        } else {
          setSelectedGuildId("");
        }
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "サーバー一覧の取得に失敗しました");
      } finally {
        if (mounted) setIsLoadingGuilds(false);
      }
    };

    void loadGuilds();
    return () => {
      mounted = false;
    };
  }, [user, apiBaseUrl]);

  useEffect(() => {
    if (!selectedGuildId) {
      setTemplates([]);
      setChannels([]);
      setConfig(DEFAULT_CONFIG);
      return;
    }

    let mounted = true;

    const loadTemplatesAndConfig = async () => {
      setIsLoadingTemplates(true);
      setError(null);
      try {
        const [templateRes, configRes] = await Promise.all([
          fetch(`${apiBaseUrl}/api/plus/templates?guildId=${encodeURIComponent(selectedGuildId)}`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`${apiBaseUrl}/api/plus/template-button-config?guildId=${encodeURIComponent(selectedGuildId)}`, {
            credentials: "include",
            cache: "no-store",
          }),
        ]);

        const templateData = await templateRes.json().catch(() => ({}));
        const configData = await configRes.json().catch(() => ({}));

        if (!templateRes.ok) {
          throw new Error(templateData?.error || "テンプレート一覧の取得に失敗しました");
        }
        if (!configRes.ok) {
          throw new Error(configData?.error || "募集作成ボタン設定の取得に失敗しました");
        }

        if (!mounted) return;

        const nextTemplates = Array.isArray(templateData?.templates) ? templateData.templates : [];
        setTemplates(nextTemplates);

        const loadedConfig = toConfig(configData?.config);
        if (!loadedConfig.templateName && nextTemplates.length > 0) {
          loadedConfig.templateName = String(nextTemplates[0]?.name || "");
        }
        setConfig(loadedConfig);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "テンプレート設定の取得に失敗しました");
      } finally {
        if (mounted) setIsLoadingTemplates(false);
      }
    };

    void loadTemplatesAndConfig();
    return () => {
      mounted = false;
    };
  }, [selectedGuildId, apiBaseUrl]);

  useEffect(() => {
    if (!selectedGuildId) return;
    let mounted = true;

    const loadChannels = async () => {
      setIsLoadingChannels(true);
      setError(null);
      try {
        const res = await fetch(`${apiBaseUrl}/api/plus/template-button/channels?guildId=${encodeURIComponent(selectedGuildId)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "チャンネル一覧の取得に失敗しました");

        if (!mounted) return;

        const nextChannels = Array.isArray(data?.channels) ? data.channels : [];
        setChannels(nextChannels);
        setConfig((prev) => {
          if (prev.channelId) return prev;
          return { ...prev, channelId: nextChannels[0]?.id || "" };
        });
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "チャンネル一覧の取得に失敗しました");
      } finally {
        if (mounted) setIsLoadingChannels(false);
      }
    };

    void loadChannels();
    return () => {
      mounted = false;
    };
  }, [selectedGuildId, apiBaseUrl]);

  const canSubmit = useMemo(() => {
    return Boolean(
      selectedGuildId &&
      config.templateName &&
      config.buttonLabel &&
      config.embedTitle &&
      config.embedDescription &&
      config.channelId
    );
  }, [selectedGuildId, config]);

  const saveConfig = async () => {
    if (!selectedGuildId) return;
    setIsSavingConfig(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/plus/template-button-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ guildId: selectedGuildId, ...config }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "設定保存に失敗しました");
      setConfig(toConfig(data?.config));
      setSuccess("設定を保存しました。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "設定保存に失敗しました");
    } finally {
      setIsSavingConfig(false);
    }
  };

  const sendButtonMessage = async () => {
    if (!selectedGuildId) return;
    setIsSending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/plus/template-button/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ guildId: selectedGuildId, ...config }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "募集作成ボタンの送信に失敗しました");

      const sentChannelId = String(data?.channelId || config.channelId || "");
      const sentMessageId = String(data?.messageId || "");
      const messageLink = sentChannelId && sentMessageId
        ? `https://discord.com/channels/${selectedGuildId}/${sentChannelId}/${sentMessageId}`
        : null;

      setSuccess(
        messageLink
          ? `募集作成ボタンを送信しました。${messageLink}`
          : "募集作成ボタンを送信しました。"
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "募集作成ボタンの送信に失敗しました");
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen bg-gradient-to-b from-amber-50 via-rose-50 to-white text-stone-700 flex items-center justify-center">読み込み中...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 via-rose-50 to-white flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white/90 p-6 shadow-sm text-center space-y-3">
          <h1 className="text-lg font-semibold text-stone-900">募集作成ボタン設定</h1>
          <p className="text-sm text-stone-600">続行するにはDiscordアカウントでログインしてください。</p>
          <button className="w-full px-5 py-3 bg-brand-500 hover:bg-brand-400 text-white rounded-xl font-semibold" onClick={() => login("/plus/templates/button")}>Discordでログイン</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-rose-50 to-white text-stone-800">
      <header className="border-b border-amber-200/80 bg-white/80 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-stone-900">募集作成ボタン設定</h1>
            <p className="text-xs sm:text-sm text-stone-600">2/2: テンプレ紐づけ、ボタンデザイン、送信チャンネルを設定して投稿できます。</p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/plus/templates" className="text-brand-700 hover:text-brand-900">1/2 テンプレ編集へ</Link>
            <Link href="/subscription" className="text-brand-700 hover:text-brand-900">サブスク管理へ</Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="rounded-2xl border border-amber-200 bg-white/90 p-5 shadow-sm space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-2">対象サーバー</label>
            {isLoadingGuilds ? (
              <p className="text-sm text-stone-500">サーバー読み込み中...</p>
            ) : (
              <select
                value={selectedGuildId}
                onChange={(e) => setSelectedGuildId(e.target.value)}
                className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-800"
              >
                {guilds.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-2">紐づけテンプレート</label>
              <select
                value={config.templateName}
                onChange={(e) => setConfig((prev) => ({ ...prev, templateName: e.target.value }))}
                className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
                disabled={isLoadingTemplates}
              >
                <option value="">テンプレートを選択</option>
                {templates.map((t) => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-2">送信チャンネル</label>
              <select
                value={config.channelId}
                onChange={(e) => setConfig((prev) => ({ ...prev, channelId: e.target.value }))}
                className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
                disabled={isLoadingChannels}
              >
                <option value="">チャンネルを選択</option>
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>#{ch.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-2">ボタン表示名</label>
              <input
                className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
                value={config.buttonLabel}
                onChange={(e) => setConfig((prev) => ({ ...prev, buttonLabel: e.target.value.slice(0, 80) }))}
                placeholder="例: 募集を作成"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-2">ボタン色</label>
              <select
                value={config.buttonStyle}
                onChange={(e) => setConfig((prev) => ({ ...prev, buttonStyle: normalizeButtonStyle(e.target.value) }))}
                className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
              >
                <option value="primary">青 (Primary)</option>
                <option value="secondary">グレー (Secondary)</option>
                <option value="success">緑 (Success)</option>
                <option value="danger">赤 (Danger)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-2">Embedタイトル</label>
            <input
              className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
              value={config.embedTitle}
              onChange={(e) => setConfig((prev) => ({ ...prev, embedTitle: e.target.value.slice(0, 256) }))}
              placeholder="例: 募集作成"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-2">Embed本文</label>
            <textarea
              className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm h-28"
              value={config.embedDescription}
              onChange={(e) => setConfig((prev) => ({ ...prev, embedDescription: e.target.value.slice(0, 4000) }))}
              placeholder="例: 下のボタンから募集を作成できます。"
            />
          </div>

          {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>}
          {success && <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700 break-all">{success}</div>}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={saveConfig}
              disabled={!canSubmit || isSavingConfig || isSending}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-amber-300 text-stone-700 hover:bg-amber-50 disabled:opacity-50"
            >
              {isSavingConfig ? "保存中..." : "設定を保存"}
            </button>
            <button
              type="button"
              onClick={sendButtonMessage}
              disabled={!canSubmit || isSavingConfig || isSending}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-semibold disabled:opacity-50"
            >
              {isSending ? "送信中..." : "募集作成ボタンを送信"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
