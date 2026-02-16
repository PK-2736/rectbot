import { Suspense } from 'react';
import SuccessContent from './success-content';

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-white">読み込み中...</div>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
