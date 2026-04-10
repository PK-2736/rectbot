import Link from "next/link";

const highlights = [
  {
    title: "募集を見やすく",
    description: "参加情報を整理して、すぐ読める形で伝えます。",
  },
  {
    title: "課金をまとめる",
    description: "サブスク状態や導線をひとつの流れにまとめます。",
  },
  {
    title: "管理をシンプルに",
    description: "機能を詰め込みすぎず、必要な場所へすぐ進めます。",
  },
];

const quickLinks = [
  { href: "/subscription", label: "サブスクを見る" },
  { href: "/plus/templates", label: "テンプレート" },
  { href: "/privacy", label: "プライバシー" },
  { href: "/terms", label: "利用規約" },
];

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#fffaf4] text-slate-800">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,126,66,0.18),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(255,61,138,0.10),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.75),rgba(255,250,244,0.96))]" />
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between rounded-full border border-brand-200 bg-white/75 px-5 py-3 backdrop-blur">
          <div>
            <p className="text-sm font-semibold text-brand-700">Recrubo Dashboard</p>
            <p className="text-xs text-slate-500">dash.recrubo.net</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/subscription" className="rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform duration-200 hover:-translate-y-0.5">
              サブスク
            </Link>
            <Link href="/plus/templates" className="hidden rounded-full border border-brand-200 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-white sm:inline-flex">
              テンプレ
            </Link>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-[1.08fr_0.92fr]">
          <section className="space-y-6">
            <span className="inline-flex items-center rounded-full border border-brand-200 bg-white/90 px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm backdrop-blur">
              dash.recrubo.net
            </span>
            <div className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">Dashboard</p>
              <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                必要な画面へ、
                <span className="bg-gradient-to-r from-brand-500 to-accent-500 bg-clip-text text-transparent">すぐ進める。</span>
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
                Recrubo の管理画面は、契約確認やテンプレ編集にすぐ入れるシンプルな入口にしています。まずは全体を把握して、必要な機能だけ開いてください。
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/subscription" className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-6 py-3 text-base font-semibold text-white shadow-sm transition-transform duration-200 hover:-translate-y-0.5">
                サブスク画面へ
              </Link>
              <Link href="/plus/templates" className="inline-flex items-center justify-center rounded-full border border-brand-200 bg-white/90 px-6 py-3 text-base font-semibold text-slate-800 shadow-sm transition-colors duration-200 hover:bg-white">
                テンプレを見る
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {highlights.map((item) => (
                <div key={item.title} className="rounded-2xl border border-brand-100 bg-white/80 p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
                </div>
              ))}
            </div>
          </section>

          <aside className="relative">
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-brand-200/40 via-white/60 to-accent-200/30 blur-2xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-brand-100 bg-white/85 p-5 shadow-[0_20px_60px_rgba(255,126,66,0.12)] backdrop-blur">
              <div className="rounded-[1.5rem] border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-rose-50 p-5 sm:p-6">
                <div className="flex items-center justify-between border-b border-brand-100 pb-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Quick Access</p>
                    <p className="text-xs text-slate-500">シンプルに、必要な場所だけ</p>
                  </div>
                  <span className="rounded-full bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-700">warm</span>
                </div>

                <div className="mt-4 grid gap-3">
                  {quickLinks.map((item, index) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center justify-between rounded-2xl border border-brand-100 bg-white/90 px-4 py-4 text-slate-800 transition-transform duration-200 hover:-translate-y-0.5"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                        <p className="mt-1 text-xs text-slate-500">{index === 0 ? "契約と状態を確認" : index === 1 ? "テンプレート編集" : index === 2 ? "公開ポリシー" : "利用ルール"}</p>
                      </div>
                      <span className="text-brand-600">→</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
