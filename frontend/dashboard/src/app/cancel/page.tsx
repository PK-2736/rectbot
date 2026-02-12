"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CancelPage() {
  const router = useRouter();

  useEffect(() => {
    // 5秒後にダッシュボードにリダイレクト
    const timer = setTimeout(() => {
      router.push('/');
    }, 5000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700 text-center">
        <div className="w-16 h-16 bg-gray-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        
        <h1 className="text-3xl font-bold text-white mb-4">
          お支払いがキャンセルされました
        </h1>
        
        <p className="text-gray-300 mb-6">
          お支払い処理がキャンセルされました。
          <br />
          いつでも再度お試しいただけます。
        </p>

        <div className="bg-blue-600/20 border border-blue-500 rounded-lg p-4 mb-6">
          <p className="text-blue-200 text-sm">
            <strong>ご質問がありますか？</strong>
            <br />
            Discord サーバーでサポートチームにお問い合わせください。
          </p>
        </div>

        <button
          onClick={() => router.push('/')}
          className="w-full py-3 px-6 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-colors"
        >
          ダッシュボードに戻る
        </button>

        <p className="text-sm text-gray-400 mt-4">
          5秒後に自動的にダッシュボードに移動します
        </p>
      </div>
    </div>
  );
}
