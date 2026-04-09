"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import UserDashboard from "@/components/UserDashboard";
import SubscriptionManagement from "@/components/SubscriptionManagement";
import { DashboardShell } from "@/components/DashboardShell";
import Link from "next/link";
import { CircleDollarSign, LayoutGrid, ShieldCheck, Sparkles } from "lucide-react";

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

export default function SubscriptionPage() {
  const { user, login, isLoading } = useAuth();
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);

  useEffect(() => {
    if (!user) return;

    setSubscriptionLoading(true);
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.recrubo.net";

    fetch(`${apiBaseUrl}/api/stripe/subscription-status`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || `status fetch failed (${res.status})`);
        }
        const data = await res.json();
        setSubscriptionStatus(data);
      })
      .catch((err) => {
        console.error('Failed to fetch subscription status:', err);
        setSubscriptionStatus(null);
      })
      .finally(() => setSubscriptionLoading(false));
  }, [user]);

  if (isLoading) {
    return (
      <DashboardShell>
        <div className="grid min-h-[60vh] place-items-center">
          <div className="dashboard-panel-strong w-full max-w-md p-8 text-center">
            <div className="mx-auto mb-5 h-14 w-14 animate-pulse rounded-2xl bg-cyan-400/20" />
            <p className="dashboard-muted-label mb-3">Authentication</p>
            <h1 className="font-display text-3xl font-bold text-white">読み込み中</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">ログイン状態と契約情報を確認しています。数秒お待ちください。</p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  if (!user) {
    return (
      <DashboardShell>
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <section className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100">
              <CircleDollarSign className="h-4 w-4" />
              月額500円で募集機能を拡張
            </div>
            <div className="space-y-4">
              <p className="dashboard-muted-label">Subscription Hub</p>
              <h1 className="font-display text-4xl font-bold leading-tight text-white sm:text-5xl">
                契約管理を、
                <span className="bg-gradient-to-r from-cyan-300 via-sky-300 to-indigo-300 bg-clip-text text-transparent">迷わず使える画面</span>
                に。
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-300">
                サーバー選択、支払い管理、テンプレート編集までを1つの画面に整理しました。
                契約状況がすぐ分かり、次に何をすればいいかも明確です。
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { icon: LayoutGrid, title: 'テンプレ管理', text: '保存・削除・編集を一箇所で' },
                { icon: Sparkles, title: '募集拡張', text: '上限解除で運用をスムーズに' },
                { icon: ShieldCheck, title: '法務導線', text: '利用規約・特商法・プライバシーを明示' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="dashboard-panel p-4">
                    <Icon className="mb-3 h-5 w-5 text-cyan-200" />
                    <h2 className="text-sm font-semibold text-white">{item.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-400">{item.text}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="dashboard-panel-strong p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="dashboard-muted-label">Login Required</p>
                <h2 className="font-display text-2xl font-bold text-white">Discordでログイン</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                約30秒で開始
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-sm leading-6 text-slate-300">
                この画面を利用するにはDiscordログインが必要です。ログイン後、契約状態とサーバー選択が表示されます。
              </p>

              <button
                onClick={() => login('/subscription')}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 px-6 py-4 font-semibold text-white shadow-lg shadow-cyan-500/20 transition-transform hover:-translate-y-0.5"
              >
                <CircleDollarSign className="h-5 w-5" />
                Discordでログインして続行
              </button>

              <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                <Link href="/terms" className="rounded-full border border-white/10 px-3 py-1 hover:text-white">利用規約</Link>
                <Link href="/tokushoho" className="rounded-full border border-white/10 px-3 py-1 hover:text-white">特商法</Link>
                <Link href="/privacy" className="rounded-full border border-white/10 px-3 py-1 hover:text-white">プライバシー</Link>
              </div>
            </div>
          </section>
        </div>
      </DashboardShell>
    );
  }

  if (subscriptionLoading) {
    return (
      <DashboardShell>
        <div className="grid min-h-[60vh] place-items-center">
          <div className="dashboard-panel-strong w-full max-w-lg p-8 text-center">
            <div className="mx-auto mb-5 h-14 w-14 animate-spin rounded-full border-4 border-cyan-400/20 border-t-cyan-300" />
            <p className="dashboard-muted-label mb-3">Subscription Status</p>
            <h1 className="font-display text-3xl font-bold text-white">契約情報を確認中</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">Stripe と Discord の状態を照合しています。あと少しで表示されます。</p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  if (subscriptionStatus?.hasSubscription && subscriptionStatus?.isPremium) {
    return <SubscriptionManagement status={subscriptionStatus} />;
  }

  return <UserDashboard />;
}
