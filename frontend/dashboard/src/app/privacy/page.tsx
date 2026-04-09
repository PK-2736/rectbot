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
            <p>Recrubo（以下「本サービス」）は、サービス提供のために次の情報を取得します。</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-400">
              <li>Discord OAuth認証で取得される情報（ユーザーID、ユーザー名、メールアドレス、アクセストークン）</li>
              <li>Discord APIから取得するギルド情報（サーバーID、サーバー名、権限情報）</li>
              <li>サブスクリプション管理情報（Stripeの顧客ID、サブスクリプションID、購入サーバーID、価格ID、金額、通貨、課金周期、契約状態、契約期間）</li>
              <li>本サービス利用に必要な設定情報（ギルド設定、テンプレート設定、操作ログ）</li>
              <li>Cookie情報（認証用 `jwt` Cookie、Discord API連携用 `discord_at` Cookie）</li>
            </ul>
            <p className="mt-2">なお、カード番号等の決済機密情報はStripe, Inc.が処理し、本サービスは保持しません。</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">2. 情報の利用目的</h2>
            <ul className="list-disc list-inside space-y-1 text-gray-400">
              <li>ユーザー認証およびダッシュボード利用のため</li>
              <li>サーバー一覧表示およびプレミアム適用サーバー判定のため</li>
              <li>Stripe決済、契約状態反映、請求関連対応のため</li>
              <li>障害対応、不正利用対策、セキュリティ維持のため</li>
              <li>お問い合わせ対応およびサービス改善のため</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">3. 第三者への提供</h2>
            <p>
              本サービスは、次の場合を除き、個人情報を第三者へ提供しません。
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-400">
              <li>決済処理のためにStripe, Inc.へ必要情報を連携する場合</li>
              <li>Discord OAuthおよびDiscord API連携に必要な範囲でDiscordへアクセスする場合</li>
              <li>法令に基づき開示が必要な場合</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">4. Cookieとトークンの利用</h2>
            <p>
              本サービスは、ログイン状態維持のために `jwt` Cookie、Discord API連携のために `discord_at` Cookie を利用します。
              これらは HttpOnly / Secure / SameSite=Lax 属性で設定されます。`jwt` Cookieの有効期間は最大7日間です。
              `discord_at` CookieはDiscord側トークン有効期限に基づき失効します。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">5. データの保管・セキュリティ</h2>
            <p>
              本サービスは、収集情報をSupabase等のインフラ上で管理し、通信の暗号化やアクセス制御など、合理的な安全管理措置を講じます。
              ただし、インターネット通信の性質上、完全な安全性を保証するものではありません。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">6. 保存期間</h2>
            <p>
              取得した情報は、利用目的達成に必要な期間または法令上必要な期間保管します。
              契約情報・課金情報は、監査・不正防止・会計対応のため、契約終了後も一定期間保持する場合があります。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">7. 開示・訂正・削除等の請求</h2>
            <p>
              保有個人情報の開示、訂正、利用停止、削除等を希望される場合は、下記窓口までご連絡ください。
              ご本人確認の上、法令に従って対応します。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">8. ポリシーの変更</h2>
            <p>
              本ポリシーは必要に応じて改定されることがあります。重要な変更がある場合はサービス内でお知らせします。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3 border-b border-gray-700 pb-2">9. お問い合わせ窓口</h2>
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
          <Link href="/terms" className="hover:text-gray-300 transition-colors">利用規約</Link>
          <Link href="/subscription" className="hover:text-gray-300 transition-colors">サブスクリプション</Link>
          <Link href="/tokushoho" className="hover:text-gray-300 transition-colors">特定商取引法に基づく表示</Link>
        </div>
      </footer>
    </div>
  );
}
