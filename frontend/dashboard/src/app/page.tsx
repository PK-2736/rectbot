import Link from "next/link";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#fffaf4] text-slate-800">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,126,66,0.12),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.86),rgba(255,250,244,0.98))]" />
      <div className="relative mx-auto grid min-h-screen max-w-3xl place-items-center px-4 py-10 sm:px-6 lg:px-8">
        <section className="w-full rounded-3xl border border-brand-100 bg-white/95 p-7 shadow-xl shadow-brand-500/10 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-600">dash.recrubo.net</p>
          <h1 className="mt-3 font-display text-3xl font-bold text-slate-900 sm:text-4xl">
            サブスク決済ページ
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
            ここは Recrubo Plus の契約と決済確認のためのページです。必要な操作だけをシンプルに表示しています。
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/subscription" className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-6 py-3 text-base font-semibold text-white shadow-sm transition-transform duration-200 hover:-translate-y-0.5">
              決済ページへ進む
            </Link>
            <Link href="https://recrubo.net" className="inline-flex items-center justify-center rounded-full border border-brand-200 bg-white px-6 py-3 text-base font-semibold text-slate-700 transition-colors hover:bg-brand-50">
              recrubo.net に戻る
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-500">
            <Link href="/terms" className="rounded-full border border-brand-100 px-3 py-1.5 hover:text-slate-700">利用規約</Link>
            <Link href="/privacy" className="rounded-full border border-brand-100 px-3 py-1.5 hover:text-slate-700">プライバシー</Link>
            <Link href="/tokushoho" className="rounded-full border border-brand-100 px-3 py-1.5 hover:text-slate-700">特商法</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
