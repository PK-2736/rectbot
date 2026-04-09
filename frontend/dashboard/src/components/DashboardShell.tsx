'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavIconProps = {
  className?: string;
  children?: any;
};

function ShellIcon({ className, children }: NavIconProps) {
  return <span className={className} aria-hidden="true">{children}</span>;
}

const CircleDollarSign = (props: NavIconProps) => <ShellIcon {...props}>¥</ShellIcon>;
const LayoutGrid = (props: NavIconProps) => <ShellIcon {...props}>◫</ShellIcon>;
const FileText = (props: NavIconProps) => <ShellIcon {...props}>文</ShellIcon>;
const ShieldCheck = (props: NavIconProps) => <ShellIcon {...props}>✓</ShellIcon>;
const Sparkles = (props: NavIconProps) => <ShellIcon {...props}>✦</ShellIcon>;

const NAV_ITEMS = [
  { href: '/subscription', label: 'サブスク', icon: CircleDollarSign },
  { href: '/plus/templates', label: 'テンプレ', icon: LayoutGrid },
  { href: '/terms', label: '利用規約', icon: FileText },
  { href: '/privacy', label: 'プライバシー', icon: ShieldCheck },
  { href: '/tokushoho', label: '特商法', icon: Sparkles },
];

type DashboardShellProps = {
  children?: any;
};

export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07111f] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(168,85,247,0.22),_transparent_28%),linear-gradient(180deg,_rgba(15,23,42,0.35),_rgba(3,7,18,0.92))]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl" />

      <header className="relative z-10 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-500 shadow-lg shadow-cyan-500/20">
              <span className="font-display text-lg font-bold text-white">R</span>
            </div>
            <div>
              <p className="font-display text-xl font-bold tracking-wide text-white">Recrubo Dashboard</p>
              <p className="text-sm text-slate-400">募集・課金・テンプレ管理をひとつにまとめる管理画面</p>
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
                    ? 'border-cyan-300/50 bg-cyan-400/15 text-cyan-100 shadow-lg shadow-cyan-500/10'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10 hover:text-white'
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
        {children}
      </main>
    </div>
  );
}
