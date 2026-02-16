'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { loadStripe, type Stripe } from '@stripe/stripe-js';

const stripePromise: Promise<Stripe | null> = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
);

export default function UserDashboard() {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async (priceId: string) => {
    try {
      setLoading(true);
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.recrubo.net';
      
      // Stripe Checkout セッションを作成
      const response = await fetch(`${apiBaseUrl}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ priceId }),
      });

      if (!response.ok) {
        throw new Error('決済セッションの作成に失敗しました');
      }

      const { sessionId } = await response.json();
      const stripe = (await stripePromise) as Stripe | null;
      
      if (!stripe) {
        throw new Error('Stripeの初期化に失敗しました');
      }

      // Stripe Checkout ページにリダイレクト
      const { error } = await stripe.redirectToCheckout({ sessionId });
      
      if (error) {
        console.error('Stripe redirect error:', error);
        alert('決済ページへの遷移に失敗しました');
      }
    } catch (error) {
      console.error('Subscription error:', error);
      alert('エラーが発生しました。もう一度お試しください。');
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
            プレミアムプランで、より多くの機能を使いこなそう
          </p>
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
                <span className="text-4xl font-bold text-white">¥980</span>
                <span className="text-purple-200">/月</span>
              </div>
            </div>
            
            <ul className="space-y-4 mb-8">
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-yellow-300 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-white font-medium">無制限の募集作成</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-yellow-300 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-white font-medium">カスタムパネルカラー</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-yellow-300 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-white font-medium">高度な管理機能</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-yellow-300 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-white font-medium">優先サポート</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-yellow-300 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-white font-medium">新機能への早期アクセス</span>
              </li>
            </ul>

            <button
              onClick={() => handleSubscribe('price_premium_monthly')}
              disabled={loading}
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
                募集数の上限なし。大規模なコミュニティでも安心してご利用いただけます。
              </p>
            </div>

            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              </div>
              <h4 className="text-lg font-bold text-white mb-2">カスタマイズ</h4>
              <p className="text-gray-400">
                募集パネルの色をサーバーのテーマに合わせてカスタマイズできます。
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
                プレミアムプランは、サーバー単位での契約となります。複数のサーバーでご利用の場合は、それぞれのサーバーで契約が必要です。
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
    </div>
  );
}
