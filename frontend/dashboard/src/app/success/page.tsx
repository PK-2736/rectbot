"use client";

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function SuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

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
        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        
        <h1 className="text-3xl font-bold text-white mb-4">
          お支払いありがとうございます！
        </h1>
        
        <p className="text-gray-300 mb-6">
          プレミアムプランへのアップグレードが完了しました。
          <br />
          すべての機能をお楽しみください。
        </p>

        {sessionId && (
          <p className="text-sm text-gray-400 mb-6">
            注文ID: {sessionId.slice(0, 20)}...
          </p>
        )}

        <div className="bg-purple-600/20 border border-purple-500 rounded-lg p-4 mb-6">
          <p className="text-purple-200 text-sm">
            <strong>次のステップ：</strong>
            <br />
            Discord サーバーで /settings コマンドを使用して、
            プレミアム機能を有効化してください。
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

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">読み込み中...</div>}>
      <SuccessContent />
    </Suspense>
  );
}
