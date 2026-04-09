import Link from 'next/link';

export const metadata = {
  title: '利用規約 | Recrubo',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <Link href="/subscription" className="text-gray-400 hover:text-white transition-colors text-sm">
            ← 戻る
          </Link>
          <h1 className="text-xl font-bold text-white">利用規約</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700 space-y-8 text-gray-300 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">1. 適用</h2>
            <p>
              本利用規約（以下「本規約」）は、Recrubo（以下「本サービス」）の利用条件を定めるものです。
              ユーザーは本規約に同意のうえ、本サービスを利用するものとします。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">2. サービス内容</h2>
            <p>
              本サービスは、Discordサーバーにおける募集運用支援機能および関連する管理ダッシュボード機能を提供します。
              一部機能は有料のプレミアムプラン契約時に利用可能です。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">3. アカウントおよび権限</h2>
            <p>
              ユーザーはDiscord OAuth認証を通じて本サービスを利用します。
              ユーザーは、自らの管理下にあるDiscordサーバーに対してのみ、プレミアム購入および各種設定を行うものとします。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">4. 料金および支払い</h2>
            <p>
              プレミアムプランの料金、課金周期、解約条件等は、
              <Link href="/tokushoho" className="underline hover:text-white">特定商取引法に基づく表示</Link>
              に定めるとおりです。決済はStripeを利用して行われます。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">5. 禁止事項</h2>
            <p>ユーザーは、以下の行為を行ってはなりません。</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-400">
              <li>法令または公序良俗に違反する行為</li>
              <li>本サービスまたは第三者の権利・利益を侵害する行為</li>
              <li>本サービスの運営を妨害する行為、不正アクセス、過度な負荷を与える行為</li>
              <li>不正な目的での課金、返金、認証情報の利用行為</li>
              <li>その他、運営者が不適切と判断する行為</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">6. サービス変更・停止</h2>
            <p>
              本サービスは、保守、障害対応、仕様変更、法令対応その他の理由により、
              事前の通知なく機能追加・変更・停止を行うことがあります。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">7. 利用制限・契約解除</h2>
            <p>
              ユーザーが本規約に違反した場合、または運営上必要と判断した場合、
              本サービスは事前通知なく当該ユーザーの利用を制限または停止できるものとします。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">8. 免責事項</h2>
            <p>
              本サービスは現状有姿で提供され、特定目的適合性、継続性、完全性を保証しません。
              本サービスの利用または利用不能によりユーザーに生じた損害について、
              運営者に故意または重過失がある場合を除き責任を負いません。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">9. 規約の変更</h2>
            <p>
              本規約は、必要に応じて変更されることがあります。重要な変更は本サービス上で告知します。
              変更後にユーザーが本サービスを利用した場合、変更後規約に同意したものとみなします。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">10. 準拠法・管轄</h2>
            <p>
              本規約は日本法に準拠します。本サービスに関して紛争が生じた場合は、
              東京地方裁判所を第一審の専属的合意管轄裁判所とします。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">11. お問い合わせ</h2>
            <p>
              サポートメール: support@recrubo.net
              <br />
              またはDiscordサポートサーバーからお問い合わせください。
            </p>
          </section>

          <p className="text-xs text-gray-500 pt-4">最終更新日: 2026年4月</p>
        </div>
      </main>

      <footer className="py-8 border-t border-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap justify-center gap-6 text-sm text-gray-500">
          <Link href="/subscription" className="hover:text-gray-300 transition-colors">サブスクリプション</Link>
          <Link href="/tokushoho" className="hover:text-gray-300 transition-colors">特定商取引法に基づく表示</Link>
          <Link href="/privacy" className="hover:text-gray-300 transition-colors">プライバシーポリシー</Link>
        </div>
      </footer>
    </div>
  );
}
