import Link from 'next/link';

export const metadata = {
  title: '特定商取引法に基づく表示 | Recrubo',
};

export default function TokushohoPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <Link href="/subscription" className="text-gray-400 hover:text-white transition-colors text-sm">
            ← 戻る
          </Link>
          <h1 className="text-xl font-bold text-white">特定商取引法に基づく表示</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700 space-y-8 text-gray-300">

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">販売者情報</h2>
            <dl className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-gray-400 font-medium">運営サービス名</dt>
                <dd className="col-span-2">Recrubo</dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-gray-400 font-medium">販売事業者</dt>
                <dd className="col-span-2">個人事業（請求があれば遅滞なく開示）</dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-gray-400 font-medium">運営統括責任者</dt>
                <dd className="col-span-2">請求があれば遅滞なく開示</dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-gray-400 font-medium">所在地</dt>
                <dd className="col-span-2">請求があれば遅滞なく開示</dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-gray-400 font-medium">電話番号</dt>
                <dd className="col-span-2">請求があれば遅滞なく開示</dd>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <dt className="text-gray-400 font-medium">お問い合わせ</dt>
                <dd className="col-span-2">support@recrubo.net またはDiscordサポートサーバー</dd>
              </div>
            </dl>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">販売価格</h2>
            <p className="text-sm">プレミアムプラン 月額500円（税込）</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">商品代金以外の必要料金</h2>
            <p className="text-sm">インターネット接続に必要な通信料等はお客様負担となります。</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">支払方法</h2>
            <p className="text-sm">クレジットカード（Stripe決済）</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">支払時期</h2>
            <p className="text-sm">お申し込み時に初回決済が行われ、以降はStripeの契約条件に従って自動更新課金されます。</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">サービス提供時期</h2>
            <p className="text-sm">決済完了後、通常は即時にプレミアム機能を利用できます。システム同期により反映まで時間を要する場合があります。</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">契約期間・更新</h2>
            <p className="text-sm">サブスクリプションは月額課金で自動更新されます。更新日はStripeに表示される契約情報に従います。</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">解約方法</h2>
            <p className="text-sm">
              ダッシュボードのサブスクリプション管理画面からStripeカスタマーポータルへ遷移し、解約手続きを行えます。
              解約後は次回更新日以降に自動課金が停止し、支払済み期間満了まで利用可能です。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">キャンセル・返金について</h2>
            <p className="text-sm">
              サブスクリプションはいつでも解約可能です。解約後もご購入済みの期間は引き続きサービスをご利用いただけます。
              デジタルコンテンツの性質上、原則として返金はお受けしておりません。
              ただし、サービス側の重大な不具合等による場合は個別にご相談ください。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">動作環境</h2>
            <p className="text-sm">Discordアカウントおよびインターネット接続環境が必要です。</p>
          </section>

          <p className="text-xs text-gray-500 pt-4">最終更新日: 2026年4月</p>
        </div>
      </main>

      <footer className="py-8 border-t border-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap justify-center gap-6 text-sm text-gray-500">
          <Link href="/terms" className="hover:text-gray-300 transition-colors">利用規約</Link>
          <Link href="/subscription" className="hover:text-gray-300 transition-colors">サブスクリプション</Link>
          <Link href="/privacy" className="hover:text-gray-300 transition-colors">プライバシーポリシー</Link>
        </div>
      </footer>
    </div>
  );
}
