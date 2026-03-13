'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { loadStripe } from '@stripe/stripe-js';

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

const PREMIUM_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID || process.env.NEXT_PUBLIC_STRIPE_PRICE_ID || '';

export default function UserDashboard() {
  const { user, logout, login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState('');
  const [guildsLoading, setGuildsLoading] = useState(true);
  const [guildsError, setGuildsError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.recrubo.net';
    fetch(`${apiBaseUrl}/api/discord/guilds`, { credentials: 'include' })
      .then(async (res) => {
        if (res.status === 401) {
          const data = await res.json().catch(() => ({}));
          setGuildsError(data?.error === 'NO_TOKEN' ? 'NO_TOKEN' : 'UNAUTH');
          return;
        }
        if (!res.ok) throw new Error('guild fetch failed');
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

      if (!selectedGuildId) {
        throw new Error('適用するサーバーを選択してください。');
      }

      if (!agreed) {
        throw new Error('特定商取引法に基づく表示・プライバシーポリシーへの同意が必要です。');
      }

      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.recrubo.net';

      const response = await fetch(`${apiBaseUrl}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...(PREMIUM_PRICE_ID ? { priceId: PREMIUM_PRICE_ID } : {}),
          guildId: selectedGuildId,
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      {/* ヘッダー */}
      <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">Recrubo Dashboard</h1>
            </div>
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
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-white mb-4">
            Recruboをアップグレード
          </h2>
          <p className="text-xl text-gray-300">
            月額500円で募集機能を無制限化
          </p>
          {!STRIPE_PUBLISHABLE_KEY_VALID && (
            <div className="mt-4 mx-auto max-w-3xl rounded-lg border border-red-500/40 bg-red-950/30 p-4 text-left">
              <p className="text-red-200 text-sm font-semibold">Stripe設定エラー</p>
              <p className="text-red-100 text-sm mt-1">
                NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY が未設定または不正形式です。
                値は <code>pk_test_</code> または <code>pk_live_</code> で始まる必要があります。
              </p>
            </div>
          )}
        </div>

        {/* プランカード */}
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* 無料プラン */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700">
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-white mb-2">無料プラン</h3>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-white">¥0</span>
                <span className="text-gray-400">/月</span>
              </div>
            </div>

            <ul className="space-y-4 mb-8">
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-gray-300">基本的な募集機能</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-gray-300">募集上限: 3件</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-gray-300">募集期限: 8時間</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-gray-300">コミュニティサポート</span>
              </li>
            </ul>

            <button
              disabled
              className="w-full py-3 px-6 bg-gray-700 text-gray-400 rounded-lg font-semibold cursor-not-allowed"
            >
              現在のプラン
            </button>
          </div>

          {/* プレミアムプラン */}
          <div className="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl p-8 border-2 border-purple-400 relative overflow-hidden">
            <div className="absolute top-4 right-4 bg-yellow-400 text-gray-900 px-3 py-1 rounded-full text-sm font-bold">
              おすすめ
            </div>

            <div className="mb-6">
              <h3 className="text-2xl font-bold text-white mb-2">プレミアムプラン</h3>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-white">¥500</span>
                <span className="text-purple-200">/月</span>
              </div>
            </div>

            <ul className="space-y-4 mb-6">
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-yellow-300 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-white font-medium">募集数が無制限</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-yellow-300 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-white font-medium">募集期限が無制限</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-yellow-300 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-white font-medium">優先サポート</span>
              </li>
            </ul>

            {/* サーバー選択 */}
            <div className="mb-4">
              <label className="block text-purple-100 text-sm font-semibold mb-2">
                適用するサーバー
              </label>
              {guildsLoading ? (
                <div className="text-purple-200 text-sm">サーバー一覧を読み込み中...</div>
              ) : guildsError === 'NO_TOKEN' || guildsError === 'UNAUTH' ? (
                <div className="text-yellow-200 text-sm">
                  <button
                    type="button"
                    onClick={() => login('/subscription')}
                    className="underline hover:text-yellow-100"
                  >
                    再ログイン
                  </button>
                  してサーバー一覧を取得してください。
                </div>
              ) : guildsError ? (
                <div className="text-yellow-200 text-sm">サーバー一覧の取得に失敗しました。</div>
              ) : guilds.length === 0 ? (
                <div className="text-purple-200 text-sm">管理権限のあるサーバーが見つかりません。</div>
              ) : (
                <select
                  value={selectedGuildId}
                  onChange={(e) => setSelectedGuildId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/20 text-white border border-purple-300/40 focus:outline-none focus:ring-2 focus:ring-purple-300"
                >
                  {guilds.length > 1 && (
                    <option value="" className="text-gray-900">-- サーバーを選択 --</option>
                  )}
                  {guilds.map((g) => (
                    <option key={g.id} value={g.id} className="text-gray-900">
                      {g.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* 同意チェックボックス */}
            <label className="mb-4 flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 w-4 h-4 rounded accent-purple-300 flex-shrink-0"
              />
              <span className="text-purple-100 text-sm leading-relaxed">
                <Link href="/tokushoho" target="_blank" className="underline hover:text-white">
                  特定商取引法に基づく表示
                </Link>
                および
                <Link href="/privacy" target="_blank" className="underline hover:text-white">
                  プライバシーポリシー
                </Link>
                に同意する
              </span>
            </label>

            <button
              onClick={handleSubscribe}
              disabled={loading || !selectedGuildId || !agreed}
              className="w-full py-3 px-6 bg-white hover:bg-gray-100 text-purple-600 rounded-lg font-bold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '処理中...' : 'プレミアムプランに登録'}
            </button>
          </div>
        </div>

        {/* 機能の詳細説明 */}
        <div className="mt-16 max-w-5xl mx-auto">
          <h3 className="text-2xl font-bold text-white text-center mb-8">
            プレミアムプランの特典
          </h3>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h4 className="text-lg font-bold text-white mb-2">無制限の募集</h4>
              <p className="text-gray-400">
                同時募集数の上限が解除されます。大規模コミュニティでも安心です。
              </p>
            </div>

            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              </div>
              <h4 className="text-lg font-bold text-white mb-2">募集期限の無制限化</h4>
              <p className="text-gray-400">
                標準の8時間制限を解除し、長時間の募集運用ができます。
              </p>
            </div>

            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <div className="w-12 h-12 bg-pink-600 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h4 className="text-lg font-bold text-white mb-2">優先サポート</h4>
              <p className="text-gray-400">
                問題が発生した際も、優先的にサポートチームが対応いたします。
              </p>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-16 max-w-3xl mx-auto">
          <h3 className="text-2xl font-bold text-white text-center mb-8">
            よくある質問
          </h3>
          <div className="space-y-4">
            <details className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <summary className="text-white font-semibold cursor-pointer">
                いつでもキャンセルできますか？
              </summary>
              <p className="mt-4 text-gray-400">
                はい、いつでもキャンセル可能です。キャンセル後も、支払い済みの期間は引き続きプレミアム機能をご利用いただけます。
              </p>
            </details>

            <details className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <summary className="text-white font-semibold cursor-pointer">
                複数のサーバーで使えますか？
              </summary>
              <p className="mt-4 text-gray-400">
                プレミアムはサーバー単位での適用です。複数サーバーで利用する場合は各サーバーごとに契約が必要です。
              </p>
            </details>

            <details className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <summary className="text-white font-semibold cursor-pointer">
                支払い方法は何がありますか？
              </summary>
              <p className="mt-4 text-gray-400">
                クレジットカード（Visa、Mastercard、American Express等）での支払いに対応しています。Stripeを通じて安全に決済が行われます。
              </p>
            </details>
          </div>
        </div>
      </main>

      {/* フッター */}
      <footer className="py-8 border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap justify-center gap-6 text-sm text-gray-500">
          <Link href="/tokushoho" className="hover:text-gray-300 transition-colors">
            特定商取引法に基づく表示
          </Link>
          <Link href="/privacy" className="hover:text-gray-300 transition-colors">
            プライバシーポリシー
          </Link>
        </div>
      </footer>
    </div>
  );
}
