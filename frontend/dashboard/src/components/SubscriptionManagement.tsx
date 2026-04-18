'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';
import { DashboardShell } from '@/components/DashboardShell';

type SubscriptionStatus = {
  hasSubscription: boolean;
  isPremium: boolean;
  status: string;
  activeGuildId?: string | null;
  subscriptions?: Array<{
    stripe_subscription_id?: string | null;
    purchased_guild_id?: string | null;
    status?: string | null;
    current_period_end?: string | null;
    billing_interval?: string | null;
    amount?: number | null;
    currency?: string | null;
  }>;
  subscription?: {
    stripe_subscription_id?: string | null;
    purchased_guild_id?: string | null;
    status?: string | null;
    current_period_end?: string | null;
    billing_interval?: string | null;
    amount?: number | null;
    currency?: string | null;
  } | null;
};

function formatStatus(status?: string | null) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'active') return '有効';
  if (normalized === 'trialing') return 'トライアル中';
  if (normalized === 'canceled') return 'キャンセル済み';
  if (normalized === 'past_due') return '支払い失敗';
  if (normalized === 'unpaid') return '未払い';
  if (normalized === 'incomplete') return '未完了';
  return status || '不明';
}

function formatDate(iso?: string | null) {
  if (!iso) return '不明';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '不明';
  return d.toLocaleString('ja-JP');
}

function formatPrice(amount?: number | null, currency?: string | null) {
  if (!amount || !currency) return '不明';
  const code = currency.toUpperCase();
  const zeroDecimalCurrencies = new Set(['JPY', 'KRW', 'VND']);
  const normalizedAmount = zeroDecimalCurrencies.has(code) ? amount : amount / 100;
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 0,
  }).format(normalizedAmount);
}

export default function SubscriptionManagement({ status }: { status: SubscriptionStatus }) {
  const { user, logout } = useAuth();
  const [openingPortal, setOpeningPortal] = useState(false);
  const subscriptions = Array.isArray(status.subscriptions) ? status.subscriptions : [];

  const openPortal = async () => {
    try {
      setOpeningPortal(true);
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.recrubo.net';
      const response = await fetch(`${apiBaseUrl}/api/stripe/create-portal-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ returnUrl: `${window.location.origin}/subscription` }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || 'Billing Portal の起動に失敗しました。');
      }

      const payload = await response.json();
      if (!payload?.portalUrl) {
        throw new Error('Billing Portal URL が取得できませんでした。');
      }

      window.location.href = payload.portalUrl;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Billing Portal の起動に失敗しました。';
      alert(message);
    } finally {
      setOpeningPortal(false);
    }
  };

  return (
    <DashboardShell>
      <div className="grid min-h-[70vh] place-items-center">
        <section className="dashboard-panel-strong w-full max-w-2xl p-7 sm:p-9">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="dashboard-muted-label">Subscription Active</p>
              <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">契約情報</h1>
              <p className="mt-2 text-sm text-slate-600">ログイン中: {user?.username}</p>
            </div>
            <button onClick={logout} className="rounded-full border border-brand-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-brand-50">
              ログアウト
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-brand-100 bg-white p-5">
            <p className="text-sm font-semibold text-slate-900">契約一覧</p>
            <p className="mt-1 text-xs text-slate-500">複数契約がある場合、ここで対象サーバーIDごとに確認できます。</p>

            {subscriptions.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">契約情報が見つかりません。</p>
            ) : (
              <div className="mt-3 space-y-3">
                {subscriptions.map((sub, idx) => (
                  <div key={sub.stripe_subscription_id || `sub-${idx}`} className="rounded-xl border border-brand-100 bg-brand-50/40 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] text-slate-500">対象サーバーID</p>
                        <p className="mt-0.5 break-all text-sm font-semibold text-slate-900">{sub.purchased_guild_id || '未設定'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500">状態</p>
                        <p className="mt-0.5 text-sm font-semibold text-slate-900">{formatStatus(sub.status)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500">料金</p>
                        <p className="mt-0.5 text-sm font-semibold text-slate-900">{formatPrice(sub.amount, sub.currency)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500">次回更新</p>
                        <p className="mt-0.5 text-sm font-semibold text-slate-900">{formatDate(sub.current_period_end)}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500 break-all">Subscription ID: {sub.stripe_subscription_id || '未設定'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={openPortal}
              disabled={openingPortal}
              className="inline-flex flex-1 items-center justify-center rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-6 py-3 text-base font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {openingPortal ? '起動中...' : 'Stripe管理画面を開く'}
            </button>
            <Link
              href="/subscription/add"
              className="inline-flex items-center justify-center rounded-full border border-brand-200 bg-white px-6 py-3 text-base font-semibold text-slate-700 hover:bg-brand-50"
            >
              別サーバーを追加契約
            </Link>
            <Link
              href="/plus/templates"
              className="inline-flex items-center justify-center rounded-full border border-brand-200 bg-white px-6 py-3 text-base font-semibold text-slate-700 hover:bg-brand-50"
            >
              テンプレート編集
            </Link>
          </div>

          <p className="mt-4 text-xs text-slate-500">解約・支払い方法変更は Stripe カスタマーポータルで行えます。</p>
        </section>
      </div>
    </DashboardShell>
  );
}
