import React from "react";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <div className="w-full max-w-2xl p-8 bg-white rounded-xl shadow-md flex flex-col items-center">
        <h1 className="text-3xl font-bold mb-4">Discord Bot 募集管理ダッシュボード</h1>
        <p className="text-gray-600 mb-8">ギルドの募集状況やサブスク情報を管理できます。</p>
        <div className="flex flex-col gap-4 w-full">
          {/* ここにshadcn/uiのコンポーネントを追加していきます */}
          <button className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition">ダミーボタン</button>
        </div>
      </div>
    </main>
  );
}
