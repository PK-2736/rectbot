'use client';

import { useState, useEffect } from 'react';
import { DashboardGuild } from '@/types/dashboard';
import { formatDateTime, formatDuration } from '@/lib/utils';
import { Users, Clock, Server, Activity } from 'lucide-react';

// 募集データの型定義
interface RecruitmentData {
  guild_id: string;
  channel_id: string;
  message_id: string;
  guild_name: string;
  channel_name: string;
  status: string;
  start_time: string;
  content: string;
  participants_count: number;
  start_game_time: string;
  vc?: string;
  note?: string;
}

interface AdminDashboardProps {
  initialData: DashboardGuild[];
}

export default function AdminDashboard({ initialData }: AdminDashboardProps) {
  const [recruitments, setRecruitments] = useState<RecruitmentData[]>([]);
  const [guildCount, setGuildCount] = useState<number>(0);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(false);

  // 募集データを取得する関数
  const fetchRecruitments = async () => {
    try {
      // バックエンドAPIに直接アクセス
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'https://rectbot-backend.rectbot-owner.workers.dev';
      const response = await fetch(`${backendUrl}/api/recruitment`);
      if (response.ok) {
        const data = await response.json();
        setRecruitments(Array.isArray(data) ? data : []);
      } else {
        console.error('Failed to fetch recruitments:', response.statusText);
      }
    } catch (error) {
      console.error('Error fetching recruitments:', error);
    }
  };

  // ギルド数を取得する関数
  const fetchGuildCount = async () => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'https://rectbot-backend.rectbot-owner.workers.dev';
      const response = await fetch(`${backendUrl}/api/guild-count`);
      if (response.ok) {
        const data = await response.json();
        setGuildCount(data.count || 0);
      } else {
        console.error('Failed to fetch guild count:', response.statusText);
      }
    } catch (error) {
      console.error('Error fetching guild count:', error);
    }
  };  // リアルタイム更新
  useEffect(() => {
    // 初回データ取得
    fetchRecruitments();
    fetchGuildCount();

    const interval = setInterval(async () => {
      setIsLoading(true);
      try {
        await Promise.all([fetchRecruitments(), fetchGuildCount()]);
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setIsLoading(false);
      }
    }, 5000); // 5秒間隔

    return () => clearInterval(interval);
  }, []);

  const activeRecruitments = recruitments.filter(r => r.status === 'recruiting').length;
  const totalRecruitments = recruitments.length;
  
  // 平均経過時間を計算
  const averageElapsedTime = () => {
    const activeRecs = recruitments.filter(r => r.status === 'recruiting');
    if (activeRecs.length === 0) return 0;
    
    const totalMinutes = activeRecs.reduce((sum, rec) => {
      const elapsed = new Date().getTime() - new Date(rec.start_time).getTime();
      return sum + Math.floor(elapsed / (1000 * 60));
    }, 0);
    
    return Math.floor(totalMinutes / activeRecs.length);
  };

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      {/* ヘッダー */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">管理者ダッシュボード</h1>
            <p className="text-gray-400 mt-2">
              全ギルドの募集状況をリアルタイムで監視
            </p>
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-400">
            <Activity className={`w-4 h-4 ${isLoading ? 'text-blue-500 animate-pulse' : 'text-green-500'}`} />
            <span>最終更新: {formatDateTime(lastUpdate.toISOString())}</span>
          </div>
        </div>
      </div>

      {/* 統計カード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center">
            <div className="p-3 bg-indigo-600 rounded-lg">
              <Server className="w-6 h-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-gray-400 text-sm">導入サーバー数</p>
              <p className="text-2xl font-bold text-white">{guildCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center">
            <div className="p-3 bg-blue-600 rounded-lg">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-gray-400 text-sm">総募集数</p>
              <p className="text-2xl font-bold text-white">{totalRecruitments}</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center">
            <div className="p-3 bg-green-600 rounded-lg">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-gray-400 text-sm">アクティブ募集</p>
              <p className="text-2xl font-bold text-white">{activeRecruitments}</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center">
            <div className="p-3 bg-purple-600 rounded-lg">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-gray-400 text-sm">平均経過時間</p>
              <p className="text-2xl font-bold text-white">
                {averageElapsedTime() > 60 
                  ? `${Math.floor(averageElapsedTime() / 60)}時間${averageElapsedTime() % 60}分`
                  : `${averageElapsedTime()}分`
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 募集テーブル */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-white">募集一覧</h2>
          <p className="text-gray-400 text-sm mt-1">
            {recruitments.length} 件の募集があります
          </p>
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
              {recruitments.map((recruitment) => (
                <tr key={`${recruitment.guild_id}-${recruitment.message_id}`} className="hover:bg-gray-800 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-white">{recruitment.guild_name}</p>
                      <p className="text-xs text-gray-400">{recruitment.guild_id}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-white">{recruitment.channel_name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-white">{recruitment.content}</p>
                      {recruitment.note && (
                        <p className="text-xs text-gray-400 mt-1">{recruitment.note}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-white">{recruitment.participants_count}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-white">{recruitment.start_game_time}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex flex-col items-center">
                      <span className={`text-sm font-medium ${
                        recruitment.status === 'recruiting' 
                          ? 'text-blue-400' 
                          : 'text-gray-400'
                      }`}>
                        {formatDuration(recruitment.start_time)}
                      </span>
                      {recruitment.status === 'recruiting' && (
                        <span className="text-xs text-gray-500 mt-1">
                          残り{Math.max(0, 8 - Math.floor((new Date().getTime() - new Date(recruitment.start_time).getTime()) / (1000 * 60 * 60)))}時間
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      recruitment.status === 'recruiting' 
                        ? 'bg-green-600 text-white' 
                        : recruitment.status === 'ended'
                        ? 'bg-gray-600 text-white'
                        : 'bg-red-600 text-white'
                    }`}>
                      {recruitment.status === 'recruiting' ? '募集中' : 
                       recruitment.status === 'ended' ? '終了' : '中止'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-gray-300 text-sm">
                      {new Date(recruitment.start_time).toLocaleString('ja-JP')}
                    </span>
                  </td>
                </tr>
              ))}
              {recruitments.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    募集データがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}