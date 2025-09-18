import Image from "next/image";
import styles from "./page.module.css";
"use client";
import { useSession, signIn, signOut } from "next-auth/react";
import AdminDashboard from "../components/AdminDashboard";

export default function Home() {
  const { data: session, status } = useSession();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="mb-8">
        {status === "loading" && <p>認証状態を確認中...</p>}
        {status === "unauthenticated" && (
          <button
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            onClick={() => signIn("discord")}
          >
            Discordでログイン
          </button>
        )}
        {status === "authenticated" && session.user && (
          <div className="flex flex-col items-center gap-4">
            <p>ログイン中: {session.user.name} ({session.user.email ?? "ID取得不可"})</p>
            <button
              className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
              onClick={() => signOut()}
            >
              ログアウト
            </button>
            {session.user.isAdmin ? (
              <div className="mt-8 w-full max-w-2xl">
                <AdminDashboard initialData={[]} />
              </div>
            ) : (
              <p className="mt-8 text-red-500">管理者権限がありません</p>
            )}
          </div>
        )}
      </div>
      {/* ここにダッシュボードや他のコンテンツを追加 */}
    </main>
  );
}
