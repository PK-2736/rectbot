'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';

type SubscriptionStatus = {
  hasSubscription: boolean;
  isPremium: boolean;
  status: string;
  activeGuildId?: string | null;
  subscription?: {
    stripe_subscription_id?: string | null;
    current_period_end?: string | null;
    billing_interval?: string | null;
    amount?: number | null;
    currency?: string | null;
  } | null;
};

function formatDate(iso?: string | null) {
  if (!iso) return '不明';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '不明';
  return d.toLocaleString('ja-JP');
}

function formatPrice(amount?: number | null, currency?: string | null) {
  if (!amount || !currency) return '不明';
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(amount / 100);
}

export default function SubscriptionManagement({ status }: { status: SubscriptionStatus }) {
  const { user, logout } = useAuth();
  const [openingPortal, setOpeningPortal] = useState(false);

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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">サブスクリプション管理</h1>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-gray-400">ログイン中</p>
              <p className="text-white font-medium">{user?.username}</p>
            </div>
            <button
              onClick={logout}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6">
          <p className="text-gray-400 text-sm mb-2">現在の状態</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-green-600/20 text-green-300 px-3 py-1 text-sm font-semibold">
              {status.isPremium ? 'プレミアム有効' : '非プレミアム'}
            </span>
            <span className="inline-flex items-center rounded-full bg-blue-600/20 text-blue-300 px-3 py-1 text-sm">
              status: {status.status || 'unknown'}
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">契約情報</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">プラン料金</dt>
                <dd className="text-white">{formatPrice(status.subscription?.amount, status.subscription?.currency)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">課金周期</dt>
                <dd className="text-white">{status.subscription?.billing_interval || '不明'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">次回更新日</dt>
                <dd className="text-white">{formatDate(status.subscription?.current_period_end)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Subscription ID</dt>
                <dd className="text-white break-all text-right">{status.subscription?.stripe_subscription_id || '不明'}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">適用サーバー</h2>
            <div className="space-y-2 text-sm">
              <p className="text-gray-400">現在プレミアム適用中のサーバーID</p>
              <p className="text-white font-mono break-all">{status.activeGuildId || '未設定'}</p>
            </div>
            <p className="text-xs text-gray-500 mt-4">
              サーバー名はDiscord API権限の都合で表示できない場合があります。
            </p>
          </div>
        </div>

        <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">お支払い管理</h2>
          <p className="text-gray-400 text-sm mb-4">
            プラン変更、支払い方法変更、解約はStripeのカスタマーポータルから実行できます。
          </p>
          <button
            onClick={openPortal}
            disabled={openingPortal}
            className="px-5 py-3 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {openingPortal ? '起動中...' : 'サブスク管理を開く'}
          </button>
        </div>
      </main>
    </div>
  );
}
