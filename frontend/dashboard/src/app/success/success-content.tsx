'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SuccessContent() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const AUTO_REDIRECT_MS = 10000;

  useEffect(() => {
    // クライアント側でクエリパラメータを解析
    const params = new URLSearchParams(window.location.search);
    setSessionId(params.get('session_id'));

    const timer = setTimeout(() => {
      router.push('/subscription');
    }, AUTO_REDIRECT_MS);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-[#f6f4f1] flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white/95 backdrop-blur-sm rounded-3xl p-8 border border-brand-100 shadow-xl shadow-brand-500/10 text-center">
        <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        
        <h1 className="text-3xl font-bold text-slate-900 mb-4">
          サブスクリプションの登録が完了しました！
        </h1>
        
        <p className="text-slate-600 mb-6 leading-7">
          <span className="font-semibold text-slate-800">/subscription status</span> で確認してください。
          <br />
          また何かお困りの際は公式サーバーのお問い合わせまでご連絡お願いします。
        </p>

        <a
          href="https://discord.com/channels/1414530004657766422/1434650863460421633"
          target="_blank"
          rel="noopener"
          className="inline-flex mb-6 rounded-full border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100"
        >
          公式サーバーのお問い合わせ
        </a>

        {sessionId && (
          <p className="text-sm text-slate-500 mb-6">
            注文ID: {sessionId.slice(0, 20)}...
          </p>
        )}

        <button
          onClick={() => router.push('/subscription')}
          className="w-full py-3 px-6 bg-brand-600 hover:bg-brand-700 text-white rounded-full font-semibold transition-colors"
        >
          ダッシュボードに戻る
        </button>

        <p className="text-sm text-slate-500 mt-4">
          10秒後に自動的にダッシュボードに移動します
        </p>
      </div>
    </div>
  );
}
