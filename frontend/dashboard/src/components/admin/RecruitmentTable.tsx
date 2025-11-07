"use client";
import React from 'react';
import type { RecruitmentData } from './types';
import { formatDuration } from '@/lib/utils';

function isOldRecruitment(startTime: string) {
  const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000);
  return new Date(startTime) < eightHoursAgo;
}

interface TableProps {
  recruitments: RecruitmentData[];
}

export function RecruitmentTable({ recruitments }: TableProps) {
  const oldCount = recruitments.filter((r) => isOldRecruitment(r.start_time)).length;
  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-white">募集一覧</h2>
        <p className="text-gray-400 text-sm mt-1">
          {recruitments.length} 件の募集があります
          {oldCount > 0 && <span className="text-red-400 ml-2">· {oldCount}件の古い募集（8時間以上経過）</span>}
        </p>
        <p className="text-gray-500 text-xs mt-1">古い募集（赤色表示）は自動的にクリーンアップされます。手動削除も可能です。</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-700 rounded-lg">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-200">ギルド名</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-200">チャンネル</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-200">募集内容</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-200">人数</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-200">開始時間</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-200">経過時間</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-200">ステータス</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-200">作成日時</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {recruitments.map((r) => {
              const isOld = isOldRecruitment(r.start_time);
              const key = r.id || r.recruitId || r.message_id || `${r.guild_id}-${r.message_id}`;
              return (
                <tr key={key} className={`transition-colors ${isOld ? 'bg-red-900/20 hover:bg-red-900/30 border-l-4 border-red-500' : 'hover:bg-gray-800'}`}>
                  <td className="px-4 py-3">
                    <div>
                      <p className={`font-medium ${isOld ? 'text-red-300' : 'text-white'}`}>
                        {r.guild_name}
                        {isOld && <span className="ml-2 text-xs bg-red-600 px-2 py-1 rounded-full">古い募集</span>}
                      </p>
                      <p className="text-xs text-gray-400">{r.guild_id}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3"><p className="text-white">{r.channel_name}</p></td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-white">{r.content || r.title}</p>
                      {r.note && <p className="text-xs text-gray-400 mt-1">{r.note}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center"><span className="text-white">{r.participants_count ?? r.currentParticipants ?? 0}</span></td>
                  <td className="px-4 py-3 text-center"><span className="text-white">{r.start_game_time}</span></td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex flex-col items-center">
                      <span className={`text-sm font-medium ${r.status === 'recruiting' ? 'text-blue-400' : 'text-gray-400'}`}>{formatDuration(r.start_time)}</span>
                      {r.status === 'recruiting' && (
                        <span className="text-xs text-gray-500 mt-1">残り{Math.max(0, 8 - Math.floor((Date.now() - new Date(r.start_time).getTime()) / (1000 * 60 * 60)))}時間</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${r.status === 'recruiting' ? 'bg-green-600 text-white' : r.status === 'ended' ? 'bg-gray-600 text-white' : 'bg-red-600 text-white'}`}>
                      {r.status === 'recruiting' ? '募集中' : r.status === 'ended' ? '終了' : '中止'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center"><span className="text-gray-300 text-sm">{new Date(r.start_time).toLocaleString('ja-JP')}</span></td>
                </tr>
              );
            })}
            {recruitments.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">募集データがありません</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
