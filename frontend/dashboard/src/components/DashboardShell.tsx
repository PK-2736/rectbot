'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

type NavIconProps = {
  className?: string;
  label: string;
};

function ShellIcon({ className, label }: NavIconProps) {
  return <span className={className} aria-hidden="true">{label}</span>;
}

const CircleDollarSign = (props: Omit<NavIconProps, 'label'>) => <ShellIcon {...props} label="¥" />;
const LayoutGrid = (props: Omit<NavIconProps, 'label'>) => <ShellIcon {...props} label="◫" />;
const FileText = (props: Omit<NavIconProps, 'label'>) => <ShellIcon {...props} label="文" />;
const ShieldCheck = (props: Omit<NavIconProps, 'label'>) => <ShellIcon {...props} label="✓" />;
const Sparkles = (props: Omit<NavIconProps, 'label'>) => <ShellIcon {...props} label="✦" />;

const NAV_ITEMS = [
  { href: '/subscription', label: 'サブスク', icon: CircleDollarSign },
  { href: '/plus/templates', label: 'テンプレ', icon: LayoutGrid },
  { href: '/terms', label: '利用規約', icon: FileText },
  { href: '/privacy', label: 'プライバシー', icon: ShieldCheck },
  { href: '/tokushoho', label: '特商法', icon: Sparkles },
];

type DashboardShellProps = {
  children?: ReactNode;
};

export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fffaf4] text-slate-800">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,126,66,0.16),_transparent_38%),radial-gradient(circle_at_bottom_left,_rgba(255,61,138,0.10),_transparent_34%),linear-gradient(180deg,_rgba(255,255,255,0.78),_rgba(255,250,244,0.96))]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,126,66,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,126,66,0.08)_1px,transparent_1px)] [background-size:56px_56px]" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-300/20 blur-3xl" />

      <header className="relative z-10 border-b border-brand-100 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 shadow-lg shadow-brand-500/20">
              <span className="font-display text-lg font-bold text-white">R</span>
            </div>
            <div>
              <p className="font-display text-xl font-bold tracking-wide text-slate-900">Recrubo Dashboard</p>
              <p className="text-sm text-slate-500">募集・課金・テンプレ管理をひとつにまとめる管理画面</p>
            </div>
          </div>

          <nav className="flex flex-wrap gap-2">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200 ${active
                    ? 'border-brand-300 bg-brand-100 text-brand-700 shadow-md shadow-brand-500/10'
                    : 'border-brand-100 bg-white/80 text-slate-600 hover:border-brand-200 hover:bg-white hover:text-slate-900'
                    }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        {children as ReactNode}
      </main>
    </div>
  );
}
