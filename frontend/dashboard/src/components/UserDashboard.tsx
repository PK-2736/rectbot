'use client';

import { useState, useEffect } from 'react';
import { UserSubscription } from '@/types/dashboard';
import { formatDateTime } from '@/lib/utils';
import * as Icons from 'lucide-react';

// Safe icon wrapper: try to render the lucide icon if available, otherwise render a simple emoji fallback.
type IconOrFallbackProps = {
  name: string; // icon name to look up on lucide-react
  className?: string;
  children?: React.ReactNode; // fallback content (emoji)
};

function IconOrFallback({ name, className, children }: IconOrFallbackProps) {
  // lucide-react exports icons as named exports; access dynamically and fall back if missing
  const Comp = (Icons as any)[name];
  if (Comp) return <Comp className={className} />;
  return (
    <span className={className} aria-hidden>
      {children ?? '❓'}
    </span>
  );
}

interface UserDashboardProps {
  initialData: UserSubscription[];
}

export default function UserDashboard({ initialData }: UserDashboardProps) {
  // リアルタイム更新
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        // TODO: ユーザー向けAPIエンドポイントを実装
        console.log('User dashboard update check');
      } catch (error) {
        console.error('Failed to fetch user dashboard data:', error);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const totalGuilds = initialData.length;
  const subscribedGuilds = initialData.filter(s => s.is_subscribed).length;
  const codeAppliedGuilds = initialData.filter(s => s.sub_code_applied).length;

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      {/* ヘッダー */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">マイダッシュボード</h1>
        <p className="text-slate-400 mt-2">
          あなたのサブスクリプション状況とサーバー情報
        </p>
      </div>

      {/* 統計カード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="card">
          <div className="flex items-center">
            <div className="p-3 bg-blue-600 rounded-lg">
              <IconOrFallback name="Server" className="w-6 h-6 text-white">🖥️</IconOrFallback>
            </div>
            <div className="ml-4">
              <p className="text-slate-400 text-sm">参加サーバー数</p>
              <p className="text-2xl font-bold text-white">{totalGuilds}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-3 bg-purple-600 rounded-lg">
              <IconOrFallback name="Crown" className="w-6 h-6 text-white">👑</IconOrFallback>
            </div>
            <div className="ml-4">
              <p className="text-slate-400 text-sm">サブスク契約中</p>
              <p className="text-2xl font-bold text-white">{subscribedGuilds}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-3 bg-green-600 rounded-lg">
              <IconOrFallback name="Gift" className="w-6 h-6 text-white">🎁</IconOrFallback>
            </div>
            <div className="ml-4">
              <p className="text-slate-400 text-sm">コード適用済み</p>
              <p className="text-2xl font-bold text-white">{codeAppliedGuilds}</p>
            </div>
          </div>
        </div>
      </div>

      {/* サーバーリスト */}
      <div className="card">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-white">参加サーバー一覧</h2>
          <p className="text-slate-400 text-sm mt-1">
            rectbotが導入されているサーバーのサブスクリプション状況
          </p>
        </div>

        <div className="space-y-4">
          {initialData.map((subscription) => (
            <div key={subscription.guild_id} className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-slate-700 rounded-lg">
                    <IconOrFallback name="Server" className="w-6 h-6 text-slate-300">🖥️</IconOrFallback>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {subscription.guild_name}
                    </h3>
                    <p className="text-sm text-slate-400">
                      サーバーID: {subscription.guild_id}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  {/* サブスクリプション状態 */}
                  <div className="flex items-center space-x-2">
                    {subscription.is_subscribed ? (
                      <>
                        <IconOrFallback name="CheckCircle" className="w-5 h-5 text-green-500">✅</IconOrFallback>
                        <span className="text-green-400 font-medium">サブスク契約中</span>
                      </>
                    ) : (
                      <>
                        <IconOrFallback name="XCircle" className="w-5 h-5 text-slate-500">❌</IconOrFallback>
                        <span className="text-slate-400">未契約</span>
                      </>
                    )}
                  </div>

                  {/* サブスクコード適用状態 */}
                  <div className="flex items-center space-x-2">
                    {subscription.sub_code_applied ? (
                      <>
                        <IconOrFallback name="Gift" className="w-5 h-5 text-purple-500">🎁</IconOrFallback>
                        <span className="text-purple-400 font-medium">コード適用済み</span>
                      </>
                    ) : (
                      <>
                        <IconOrFallback name="Gift" className="w-5 h-5 text-slate-500">🎁</IconOrFallback>
                        <span className="text-slate-400">コード未適用</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* サブスクリプション詳細 */}
              {subscription.is_subscribed && (
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {subscription.subscription_start && (
                      <div className="flex items-center space-x-2">
                        <IconOrFallback name="Calendar" className="w-4 h-4 text-slate-400">📅</IconOrFallback>
                        <span className="text-sm text-slate-400">開始日:</span>
                        <span className="text-sm text-slate-300">
                          {formatDateTime(subscription.subscription_start)}
                        </span>
                      </div>
                    )}
                    {subscription.subscription_end && (
                      <div className="flex items-center space-x-2">
                        <IconOrFallback name="Calendar" className="w-4 h-4 text-slate-400">📅</IconOrFallback>
                        <span className="text-sm text-slate-400">終了日:</span>
                        <span className="text-sm text-slate-300">
                          {formatDateTime(subscription.subscription_end)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* アクション */}
              <div className="mt-4 pt-4 border-t border-slate-700">
                <div className="flex space-x-3">
                  {!subscription.is_subscribed && (
                    <button className="btn-primary text-sm">
                      サブスクリプションを開始
                    </button>
                  )}
                  {!subscription.sub_code_applied && (
                    <button className="btn-secondary text-sm">
                      サブスクコードを適用
                    </button>
                  )}
                  {subscription.is_subscribed && (
                    <button className="btn-secondary text-sm">
                      契約詳細を確認
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {initialData.length === 0 && (
          <div className="text-center py-12">
            <IconOrFallback name="Server" className="w-12 h-12 text-slate-600 mx-auto mb-4">🖥️</IconOrFallback>
            <p className="text-slate-400 mb-4">
              rectbotが導入されているサーバーがありません
            </p>
            <button className="btn-primary">
              rectbotをサーバーに招待
            </button>
          </div>
        )}
      </div>

      {/* サブスクリプション情報 */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-white mb-4">サブスクリプションについて</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-start space-x-2">
              <IconOrFallback name="CheckCircle" className="w-4 h-4 text-green-500 mt-0.5">✅</IconOrFallback>
              <span className="text-slate-300">募集上限数の増加</span>
            </div>
            <div className="flex items-start space-x-2">
              <IconOrFallback name="CheckCircle" className="w-4 h-4 text-green-500 mt-0.5">✅</IconOrFallback>
              <span className="text-slate-300">高度なモデレーション機能</span>
            </div>
            <div className="flex items-start space-x-2">
              <IconOrFallback name="CheckCircle" className="w-4 h-4 text-green-500 mt-0.5">✅</IconOrFallback>
              <span className="text-slate-300">カスタムパネルカラー</span>
            </div>
            <div className="flex items-start space-x-2">
              <IconOrFallback name="CheckCircle" className="w-4 h-4 text-green-500 mt-0.5">✅</IconOrFallback>
              <span className="text-slate-300">優先サポート</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-white mb-4">サブスクコードについて</h3>
          <div className="space-y-3 text-sm">
            <p className="text-slate-300">
              サブスクコードを適用すると、一定期間サブスクリプション機能を無料で利用できます。
            </p>
            <p className="text-slate-300">
              コードはイベントやキャンペーンで配布されます。
            </p>
            <button className="btn-secondary mt-4">
              コードを適用する
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}