import Link from 'next/link';

export const metadata = {
  title: 'プライバシーポリシー | Recrubo',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <Link href="/subscription" className="text-gray-400 hover:text-white transition-colors text-sm">
            ← 戻る
          </Link>
          <h1 className="text-xl font-bold text-white">プライバシーポリシー</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700 space-y-8 text-gray-300 text-sm leading-relaxed">

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">1. 収集する情報</h2>
            <p>Recruboは、Discordログイン（OAuth2）を通じて以下の情報を収集します。</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-400">
              <li>DiscordユーザーID・ユーザー名</li>
              <li>メールアドレス（Discord連携時）</li>
              <li>所属サーバー（ギルド）一覧および権限情報</li>
            </ul>
            <p className="mt-2">また、決済時にStripeを通じて決済情報が処理されます（カード情報はStripeが保管し、当サービスは保持しません）。</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">2. 情報の利用目的</h2>
            <ul className="list-disc list-inside space-y-1 text-gray-400">
              <li>サービスの提供・認証処理</li>
              <li>サブスクリプションの管理</li>
              <li>サポート対応</li>
              <li>サービス改善・統計分析（個人を特定しない形式）</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">3. 第三者への提供</h2>
            <p>
              法令に基づく場合を除き、ユーザーの同意なく第三者に個人情報を提供することはありません。
              決済処理にはStripe, Inc.を利用しており、Stripeのプライバシーポリシーが適用されます。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">4. Discordアクセストークン</h2>
            <p>
              サーバー選択機能のため、DiscordのOAuth2アクセストークンをデータベースに保存します。
              このトークンはサーバー一覧の取得にのみ使用され、その他の操作には使用しません。
              トークンはDiscord側の有効期限（通常7日）またはアカウント連携解除により無効化されます。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">5. データの保管・セキュリティ</h2>
            <p>
              収集した情報はSupabaseを利用して安全に保管します。通信はTLSで暗号化されています。
              不正アクセス防止のために適切な技術的措置を講じています。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">6. データの削除</h2>
            <p>
              アカウントデータの削除をご希望の場合は、Discordサポートサーバーよりお問い合わせください。
              合理的な期間内に対応いたします。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">7. ポリシーの変更</h2>
            <p>
              本ポリシーは必要に応じて改定されることがあります。重要な変更がある場合はサービス内でお知らせします。
            </p>
          </section>

          <p className="text-xs text-gray-500 pt-4">最終更新日: 2026年3月</p>
        </div>
      </main>

      <footer className="py-8 border-t border-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap justify-center gap-6 text-sm text-gray-500">
          <Link href="/subscription" className="hover:text-gray-300 transition-colors">サブスクリプション</Link>
          <Link href="/tokushoho" className="hover:text-gray-300 transition-colors">特定商取引法に基づく表示</Link>
        </div>
      </footer>
    </div>
  );
}
