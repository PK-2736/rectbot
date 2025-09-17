
import { FaDiscord, FaBookOpen, FaUserShield } from "react-icons/fa";

export default function Home() {
  const discordInviteUrl = "https://discord.gg/your-invite-code";
  const discordLoginUrl = "/api/discord/login";

  return (
    <div className="relative min-h-screen flex flex-col bg-gradient-to-br from-indigo-200 via-blue-100 to-green-100 overflow-x-hidden">
      {/* アニメーション背景 */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute left-1/2 top-0 w-[120vw] h-[60vh] -translate-x-1/2 bg-gradient-to-tr from-indigo-400/30 via-blue-300/20 to-green-200/10 blur-2xl animate-pulse" />
        <div className="absolute right-0 bottom-0 w-[60vw] h-[40vh] bg-gradient-to-br from-green-300/20 via-blue-200/10 to-indigo-200/0 blur-2xl animate-pulse" />
      </div>

      {/* ナビゲーションバー */}
      <nav className="w-full flex items-center justify-between px-6 py-4 bg-white/80 shadow-sm backdrop-blur sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <FaDiscord className="text-indigo-600 text-2xl" />
          <span className="font-extrabold text-lg tracking-tight text-indigo-700">rectbot</span>
        </div>
        <div className="flex gap-2">
          <a href={discordLoginUrl} className="inline-block">
            <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold shadow hover:bg-indigo-700 transition flex items-center gap-1">
              <FaUserShield /> ログイン
            </button>
          </a>
          <a href={discordInviteUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
            <button className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold shadow hover:bg-green-700 transition flex items-center gap-1">
              <FaDiscord /> 招待
            </button>
          </a>
        </div>
      </nav>

      {/* ヒーローセクション */}
      <section className="w-full max-w-4xl mx-auto flex flex-col items-center text-center mt-16 mb-12 px-4">
        <span className="inline-flex items-center px-4 py-1 bg-indigo-600 text-white rounded-full text-xs font-semibold shadow mb-3 animate-fade-in">
          <FaDiscord className="mr-1" /> Discord Bot 募集管理
        </span>
        <h1 className="text-5xl sm:text-6xl font-extrabold mb-4 bg-gradient-to-r from-indigo-700 via-blue-500 to-green-400 text-transparent bg-clip-text drop-shadow animate-fade-in">
          サーバー募集 & サブスク管理ダッシュボード
        </h1>
        <p className="text-lg text-gray-700 mb-8 max-w-2xl mx-auto animate-fade-in">
          Discordサーバーの募集状況やサブスク情報を<br className="sm:hidden" />かんたん・安全に管理できます。
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-2 w-full animate-fade-in">
          <a href={discordLoginUrl} className="inline-block w-full sm:w-auto">
            <button className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition w-full sm:w-auto text-lg">
              <FaUserShield className="text-xl" /> Discordログイン
            </button>
          </a>
          <a href={discordInviteUrl} target="_blank" rel="noopener noreferrer" className="inline-block w-full sm:w-auto">
            <button className="flex items-center justify-center gap-2 bg-green-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-green-700 transition w-full sm:w-auto text-lg">
              <FaDiscord className="text-xl" /> 公式Discordに参加
            </button>
          </a>
        </div>
        <div className="text-xs text-gray-500 mt-2 animate-fade-in">※ Discordログイン後、管理者・ユーザー向けの機能が利用できます。</div>
      </section>

      {/* セクション分割 */}
      <div className="w-full max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 px-4 mb-16">
        <div className="bg-white/90 rounded-2xl shadow-lg p-8 flex flex-col items-center border-t-4 border-indigo-400 animate-fade-in">
          <FaBookOpen className="text-4xl text-indigo-500 mb-3" />
          <h3 className="font-bold text-xl mb-2">使い方ガイド</h3>
          <ul className="text-gray-600 text-base list-disc list-inside text-left">
            <li>公式Discordでサポート</li>
            <li>Botをサーバーに招待</li>
            <li>ダッシュボードで管理</li>
          </ul>
        </div>
        <div className="bg-white/90 rounded-2xl shadow-lg p-8 flex flex-col items-center border-t-4 border-blue-400 animate-fade-in">
          <FaUserShield className="text-4xl text-blue-500 mb-3" />
          <h3 className="font-bold text-xl mb-2">安全な認証</h3>
          <p className="text-gray-600 text-base text-center">Discord OAuth2で安全にログイン。<br />管理者・ユーザーで表示が切り替わります。</p>
        </div>
        <div className="bg-white/90 rounded-2xl shadow-lg p-8 flex flex-col items-center border-t-4 border-green-400 animate-fade-in">
          <FaDiscord className="text-4xl text-green-500 mb-3" />
          <h3 className="font-bold text-xl mb-2">公式サポート</h3>
          <p className="text-gray-600 text-base text-center">困ったときは公式Discordで<br />サポート・最新情報をチェック！</p>
        </div>
      </div>

      {/* アラート・バッジ例 */}
      <div className="w-full max-w-2xl mx-auto px-4 mb-10">
        <div className="bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 p-4 rounded-lg flex items-center gap-2 shadow animate-fade-in">
          <span className="font-bold">お知らせ:</span>
          <span>現在ベータ版です。ご意見・ご要望は公式Discordまで！</span>
        </div>
      </div>

      {/* フッター */}
      <footer className="text-xs text-gray-400 mt-auto py-6 text-center bg-white/70 backdrop-blur shadow-inner animate-fade-in">
        &copy; 2025 rectbot. All rights reserved.
      </footer>
    </div>
  );
}
