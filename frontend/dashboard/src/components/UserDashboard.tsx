'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { loadStripe } from '@stripe/stripe-js';
import { DashboardShell } from '@/components/DashboardShell';

type StripeCheckout = {
  redirectToCheckout: (options: { sessionId: string }) => Promise<{ error?: { message?: string } }>;
};

type Guild = {
  id: string;
  name: string;
  icon: string | null;
};

const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
const STRIPE_PUBLISHABLE_KEY_VALID = /^pk_(test|live)_/.test(STRIPE_PUBLISHABLE_KEY);
const stripePromise = STRIPE_PUBLISHABLE_KEY_VALID
  ? loadStripe(STRIPE_PUBLISHABLE_KEY)
  : Promise.resolve(null);

export default function UserDashboard() {
  const { user, logout, login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState('');
  const [manualGuildId, setManualGuildId] = useState('');
  const [guildsLoading, setGuildsLoading] = useState(true);
  const [guildsError, setGuildsError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const effectiveGuildId = selectedGuildId || manualGuildId.trim();
  const selectedGuildName = guilds.find((g) => g.id === selectedGuildId)?.name || '';

  useEffect(() => {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.recrubo.net';
    fetch(`${apiBaseUrl}/api/discord/guilds`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 404) {
            setGuildsError('API_NOT_DEPLOYED');
            return;
          }
          if (res.status === 401 && data?.error === 'NO_TOKEN') {
            setGuildsError('NO_TOKEN');
            return;
          }
          if (res.status === 401) {
            setGuildsError('UNAUTH');
            return;
          }
          if (res.status === 429 || data?.error === 'RATE_LIMIT') {
            setGuildsError('RATE_LIMIT');
            return;
          }
          setGuildsError(data?.message || 'FETCH_ERROR');
          return;
        }

        const data: Guild[] = await res.json();
        setGuilds(data);
        if (data.length === 1) setSelectedGuildId(data[0].id);
      })
      .catch(() => setGuildsError('FETCH_ERROR'))
      .finally(() => setGuildsLoading(false));
  }, []);

  const handleSubscribe = async () => {
    try {
      setLoading(true);

      if (!STRIPE_PUBLISHABLE_KEY_VALID) {
        throw new Error(
          `Stripe公開鍵が不正です。NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY を確認してください (length=${STRIPE_PUBLISHABLE_KEY.length}, prefix=${STRIPE_PUBLISHABLE_KEY.slice(0, 7) || 'empty'})`
        );
      }

      if (!effectiveGuildId) {
        throw new Error('適用するサーバーを選択してください。');
      }

      if (!agreed) {
        throw new Error('利用規約・特定商取引法に基づく表示・プライバシーポリシーへの同意が必要です。');
      }

      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.recrubo.net';

      const response = await fetch(`${apiBaseUrl}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          guildId: effectiveGuildId,
          guildName: selectedGuildName || undefined,
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        const errorMessage = errorPayload?.error || '決済セッションの作成に失敗しました';

        if (response.status === 401) {
          alert('ログイン有効期限が切れました。再度Discordログインしてください。');
          login('/subscription');
          return;
        }

        throw new Error(errorMessage);
      }

      const { sessionId, checkoutUrl } = await response.json();

      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }

      const stripe = (await stripePromise) as StripeCheckout | null;

      if (!stripe) {
        throw new Error('Stripeの初期化に失敗しました。ブラウザ拡張/CSP/ネットワークで https://js.stripe.com の読込がブロックされていないか確認してください。');
      }

      const { error } = await stripe.redirectToCheckout({ sessionId });

      if (error) {
        console.error('Stripe redirect error:', error);
        alert('決済ページへの遷移に失敗しました');
      }
    } catch (error) {
      console.error('Subscription error:', error);
      const message = error instanceof Error ? error.message : 'エラーが発生しました。もう一度お試しください。';
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardShell>
      <div className="grid min-h-[70vh] place-items-center">
        <section className="dashboard-panel-strong w-full max-w-2xl p-7 sm:p-9">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="dashboard-muted-label">Subscription Checkout</p>
              <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">Recrubo Plus 決済</h1>
              <p className="mt-3 text-sm text-slate-600">ログイン中: {user?.username}</p>
            </div>
            <button onClick={logout} className="rounded-full border border-brand-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-brand-50">
              ログアウト
            </button>
          </div>

          {!STRIPE_PUBLISHABLE_KEY_VALID && (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-700">Stripe設定エラー</p>
              <p className="mt-1 text-sm text-red-600">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY が未設定または不正形式です。</p>
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-brand-100 bg-white p-5">
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-slate-900">¥500</p>
              <p className="text-sm text-slate-500">/ 月</p>
            </div>
            <p className="mt-2 text-sm text-slate-600">募集機能の上限解除・優先サポートを利用できます。</p>
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-semibold text-slate-700">適用するサーバー</label>
            {guildsLoading ? (
              <div className="text-sm text-slate-500">サーバー一覧を読み込み中...</div>
            ) : guildsError === 'NO_TOKEN' || guildsError === 'UNAUTH' ? (
              <div className="text-sm text-slate-600">
                <button
                  type="button"
                  onClick={() => login('/subscription')}
                  className="mr-1 underline text-brand-700 hover:text-brand-800"
                >
                  再ログイン
                </button>
                してサーバー一覧を取得してください。
              </div>
            ) : guildsError === 'RATE_LIMIT' ? (
              <div className="text-sm text-slate-500">Discord APIが混雑中です。30秒ほど待って再読み込みしてください。</div>
            ) : guildsError === 'API_NOT_DEPLOYED' ? (
              <div className="space-y-2">
                <div className="text-sm text-slate-600">サーバー一覧APIが未反映のため、サーバーIDを手入力してください。</div>
                <input
                  type="text"
                  value={manualGuildId}
                  onChange={(e) => setManualGuildId(e.target.value)}
                  placeholder="DiscordサーバーID (例: 123456789012345678)"
                  className="w-full rounded-xl border border-brand-200 bg-white px-3 py-2 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
              </div>
            ) : guildsError ? (
              <div className="text-sm text-slate-500">サーバー一覧の取得に失敗しました。{guildsError}</div>
            ) : guilds.length === 0 ? (
              <div className="text-sm text-slate-500">管理権限のあるサーバーが見つかりません。</div>
            ) : (
              <select
                value={selectedGuildId}
                onChange={(e) => setSelectedGuildId(e.target.value)}
                className="w-full rounded-xl border border-brand-200 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-300"
              >
                {guilds.length > 1 && <option value="">-- サーバーを選択 --</option>}
                {guilds.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <label className="mt-5 flex items-start gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-4 w-4 rounded accent-brand-500"
            />
            <span>
              <Link href="/terms" target="_blank" className="underline hover:text-slate-800">利用規約</Link>
              ・
              <Link href="/tokushoho" target="_blank" className="underline hover:text-slate-800">特定商取引法に基づく表示</Link>
              ・
              <Link href="/privacy" target="_blank" className="underline hover:text-slate-800">プライバシーポリシー</Link>
              に同意する
            </span>
          </label>

          <button
            onClick={handleSubscribe}
            disabled={loading || !effectiveGuildId || !agreed}
            className="mt-6 w-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-6 py-3 text-base font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? '処理中...' : 'プレミアムプランに登録'}
          </button>

          <p className="mt-4 text-xs text-slate-500">このページはサブスク契約専用です。その他機能は契約後に利用できます。</p>
        </section>
      </div>
    </DashboardShell>
  );
}
