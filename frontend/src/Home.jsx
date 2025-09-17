import React from "react";
import { FaDiscord, FaBookOpen, FaUserShield } from "react-icons/fa";

export default function Home() {
  const discordInviteUrl = "https://discord.gg/your-invite-code";
  const discordLoginUrl = "/api/discord/login";

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-100 via-white to-blue-100 flex flex-col items-center justify-center py-12">
      {/* ヒーローセクション */}
      <section className="w-full max-w-3xl flex flex-col items-center text-center mb-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="inline-flex items-center px-3 py-1 bg-indigo-600 text-white rounded-full text-xs font-semibold shadow">
            <FaDiscord className="mr-1" /> Discord Bot
          </span>
          <span className="inline-flex items-center px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
            管理ダッシュボード
          </span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold mb-4 bg-gradient-to-r from-indigo-700 via-blue-500 to-green-400 text-transparent bg-clip-text drop-shadow">
          募集管理 & サブスクダッシュボード
        </h1>
        <p className="text-lg text-gray-700 mb-6 max-w-2xl mx-auto">
          Discordサーバーの募集状況やサブスク情報を<br className="sm:hidden" />かんたん・安全に管理できます。
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-2 w-full">
          <a href={discordLoginUrl} className="inline-block w-full sm:w-auto">
            <button className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg font-bold shadow hover:bg-indigo-700 transition w-full sm:w-auto text-lg">
              <FaUserShield className="text-xl" /> Discordログイン
            </button>
          </a>
          <a href={discordInviteUrl} target="_blank" rel="noopener noreferrer" className="inline-block w-full sm:w-auto">
            <button className="flex items-center justify-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg font-bold shadow hover:bg-green-700 transition w-full sm:w-auto text-lg">
              <FaDiscord className="text-xl" /> 公式Discordに参加
            </button>
          </a>
        </div>
        <div className="text-xs text-gray-500 mt-1">※ Discordログイン後、管理者・ユーザー向けの機能が利用できます。</div>
      </section>

      {/* 使い方カード */}
      <section className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
        <div className="bg-white rounded-xl shadow p-6 flex flex-col items-center border-t-4 border-indigo-400">
          <FaBookOpen className="text-3xl text-indigo-500 mb-2" />
          <h3 className="font-bold text-lg mb-1">使い方ガイド</h3>
          <ul className="text-gray-600 text-sm list-disc list-inside text-left">
            <li>公式Discordでサポート</li>
            <li>Botをサーバーに招待</li>
            <li>ダッシュボードで管理</li>
          </ul>
        </div>
        <div className="bg-white rounded-xl shadow p-6 flex flex-col items-center border-t-4 border-blue-400">
          <FaUserShield className="text-3xl text-blue-500 mb-2" />
          <h3 className="font-bold text-lg mb-1">安全な認証</h3>
          <p className="text-gray-600 text-sm text-center">Discord OAuth2で安全にログイン。<br />管理者・ユーザーで表示が切り替わります。</p>
        </div>
        <div className="bg-white rounded-xl shadow p-6 flex flex-col items-center border-t-4 border-green-400">
          <FaDiscord className="text-3xl text-green-500 mb-2" />
          <h3 className="font-bold text-lg mb-1">公式サポート</h3>
          <p className="text-gray-600 text-sm text-center">困ったときは公式Discordで<br />サポート・最新情報をチェック！</p>
        </div>
      </section>

      {/* フッター */}
      <footer className="text-xs text-gray-400 mt-8 text-center">
        &copy; 2025 rectbot. All rights reserved.
      </footer>
    </main>
  );
}
