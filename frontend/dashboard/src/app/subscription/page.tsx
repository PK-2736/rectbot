"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import UserDashboard from "@/components/UserDashboard";
import SubscriptionManagement from "@/components/SubscriptionManagement";
import { DashboardShell } from "@/components/DashboardShell";
import Link from "next/link";

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
        <div className="grid min-h-[70vh] place-items-center">
          <div className="dashboard-panel-strong w-full max-w-xl p-8 text-center">
            <div className="mx-auto mb-5 h-14 w-14 animate-pulse rounded-2xl bg-brand-200/60" />
            <p className="dashboard-muted-label mb-3">Authentication</p>
            <h1 className="font-display text-3xl font-bold text-slate-900">読み込み中</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">ログイン状態と契約情報を確認しています。数秒お待ちください。</p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  if (!user) {
    return (
      <DashboardShell>
        <div className="grid min-h-[70vh] place-items-center">
          <section className="dashboard-panel-strong w-full max-w-xl p-7 sm:p-9">
            <p className="dashboard-muted-label">Subscription</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-slate-900 sm:text-4xl">
              Recrubo Plus 決済ページ
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-600">
              このページではサブスク契約の開始・確認・管理を行います。先に Discord でログインしてください。
            </p>

            <button
              onClick={() => login('/subscription')}
              className="mt-7 flex w-full items-center justify-center rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-6 py-4 font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5"
            >
              Discordでログインして続行
            </button>

            <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-500">
              <Link href="/terms" className="rounded-full border border-brand-100 px-3 py-1.5 hover:text-slate-700">利用規約</Link>
              <Link href="/tokushoho" className="rounded-full border border-brand-100 px-3 py-1.5 hover:text-slate-700">特商法</Link>
              <Link href="/privacy" className="rounded-full border border-brand-100 px-3 py-1.5 hover:text-slate-700">プライバシー</Link>
            </div>
          </section>
        </div>
      </DashboardShell>
    );
  }

  if (subscriptionLoading) {
    return (
      <DashboardShell>
        <div className="grid min-h-[70vh] place-items-center">
          <div className="dashboard-panel-strong w-full max-w-xl p-8 text-center">
            <div className="mx-auto mb-5 h-14 w-14 animate-spin rounded-full border-4 border-brand-200 border-t-brand-500" />
            <p className="dashboard-muted-label mb-3">Subscription Status</p>
            <h1 className="font-display text-3xl font-bold text-slate-900">契約情報を確認中</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">Stripe と Discord の状態を照合しています。あと少しで表示されます。</p>
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
