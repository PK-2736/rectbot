import React from "react";

export default function Home() {
  // 公式Discord招待URL・OAuth2ログインURL（仮）
  const discordInviteUrl = "https://discord.gg/your-invite-code";
  const discordLoginUrl = "/api/discord/login"; // 実際はOAuth2エンドポイントにリダイレクト

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <div className="w-full max-w-2xl p-8 bg-white rounded-xl shadow-md flex flex-col items-center">
        <h1 className="text-3xl font-bold mb-4">Discord Bot 募集管理ダッシュボード</h1>
        <p className="text-gray-600 mb-6">このサイトでは、Discordサーバーの募集管理やサブスク状況の確認ができます。</p>

        <section className="mb-8 w-full">
          <h2 className="text-xl font-semibold mb-2">ボットの使い方</h2>
          <ol className="list-decimal list-inside text-gray-700 space-y-1">
            <li>公式Discordサーバーに参加し、サポートや最新情報をチェック</li>
            <li>Botを自分のサーバーに招待</li>
            <li>Discordログインでダッシュボードにアクセス</li>
            <li>募集状況やサブスク情報を管理</li>
          </ol>
        </section>

        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center mb-4">
          <a href={discordLoginUrl} className="inline-block">
            <button className="bg-indigo-600 text-white px-6 py-2 rounded font-semibold shadow hover:bg-indigo-700 transition w-full">
              Discordログイン
            </button>
          </a>
          <a href={discordInviteUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
            <button className="bg-green-600 text-white px-6 py-2 rounded font-semibold shadow hover:bg-green-700 transition w-full">
              公式Discordに参加
            </button>
          </a>
        </div>

        <div className="text-sm text-gray-500 mt-2">
          ※ Discordログイン後、管理者・ユーザー向けの機能が利用できます。
        </div>
      </div>
    </main>
  );
}
