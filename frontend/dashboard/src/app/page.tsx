"use client";

import { useAuth } from "@/components/AuthProvider";
import AdminDashboard from "../components/AdminDashboard";

export default function Home() {
  const { user, isAdmin, login, logout, isLoading } = useAuth();

  // デバッグ情報をログ出力
  console.log('Current user:', user);
  console.log('Is admin:', isAdmin);
  console.log('Is loading:', isLoading);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">読み込み中...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 p-8 rounded-lg border border-gray-700 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">
            管理者ダッシュボード
          </h1>
          <p className="text-gray-400 mb-6">
            このページにアクセスするにはDiscordでログインしてください
          </p>
          <button
            onClick={login}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
          >
            Discordでログイン
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 p-8 rounded-lg border border-gray-700 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">
            アクセス拒否
          </h1>
          <p className="text-gray-400 mb-6">
            管理者権限がありません。
          </p>
          <button
            onClick={logout}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
          >
            ログアウト
          </button>
        </div>
      </div>
    );
  }

  return <AdminDashboard initialData={[]} />;
}
