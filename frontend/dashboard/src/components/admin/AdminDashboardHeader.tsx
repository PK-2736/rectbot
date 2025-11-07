"use client";
import React from 'react';
import { formatDateTime } from '@/lib/utils';

const Activity = (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>⚡</span>;

interface HeaderProps {
  isCleaningUp: boolean;
  onCleanup: () => void;
  isLoading: boolean;
  lastUpdate: Date;
}

export function AdminDashboardHeader({ isCleaningUp, onCleanup, isLoading, lastUpdate }: HeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">管理者ダッシュボード</h1>
          <p className="text-gray-400 mt-2">全ギルドの募集状況をリアルタイムで監視</p>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={onCleanup}
            disabled={isCleaningUp}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isCleaningUp ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            {isCleaningUp ? 'クリーンアップ中...' : '古い募集を削除'}
          </button>
          <div className="flex items-center space-x-2 text-sm text-gray-400">
            <Activity className={`w-4 h-4 ${isLoading ? 'text-blue-500 animate-pulse' : 'text-green-500'}`} />
            <span>最終更新: {formatDateTime(lastUpdate.toISOString())}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
