"use client";
// 推奨: プロジェクトに @types/react, @types/node, lucide-react の型を導入してください。
import React, { useState, useEffect, useCallback } from 'react';
import { DashboardGuild } from '@/types/dashboard';
import { formatDateTime, formatDuration } from '@/lib/utils';
// Use small local fallbacks for icons to avoid lucide-react type/export issues in CI/build
const Users = (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>👥</span>;
const Clock = (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>⏱</span>;
const Server = (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>🖥️</span>;
const Activity = (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>⚡</span>;

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
  participants_count?: number;
  start_game_time: string;
  vc?: string;
  note?: string;
}

interface AdminDashboardProps {
  initialData?: DashboardGuild[];
}

export default function AdminDashboard({ initialData }: AdminDashboardProps) {
  // Map incoming DashboardGuild[] (if any) to RecruitmentData[] for initial render
  const mapInitial = (data?: DashboardGuild[]): RecruitmentData[] => {
    if (!data) return [];
    return data.map(d => ({
      guild_id: d.guild_id,
      channel_id: '',
      message_id: '',
      guild_name: d.guild_name,
      channel_name: d.channel_name || '',
      status: d.status || 'idle',
      start_time: d.start_time || new Date().toISOString(),
      content: '',
      participants_count: d.current_recruits || 0,
      start_game_time: d.start_time || '',
    }));
  };

  const [recruitments, setRecruitments] = useState<RecruitmentData[]>(mapInitial(initialData));
  const [guildCount, setGuildCount] = useState<number>(0);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  // 募集データを取得する関数（useCallback で安定化）
  const fetchRecruitments = useCallback(async () => {
    try {
      // Try a few candidate backend base URLs in order. Prefer NEXT_PUBLIC_BACKEND_API_URL if set.
      const envUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || '';
      const candidates = [] as string[];
      if (envUrl) candidates.push(envUrl.replace(/\/$/, ''));
      // Known public backend
      candidates.push('https://api.rectbot.tech');
      // Local development fallback
      candidates.push('http://localhost:3000');

      let response: Response | null = null;
      let lastError: unknown = null;

      for (const base of candidates) {
        try {
          const url = `${base}/api/public/recruitment`;
          response = await fetch(url, { cache: 'no-store' });
          if (response.ok) break; // success
          // if non-OK, keep trying other candidates
          lastError = new Error(`Non-OK response ${response.status} from ${url}`);
        } catch (err) {
          lastError = err;
          response = null;
        }
      }

      if (!response) {
        console.error('All backend candidates failed to fetch recruitment data', lastError);
        return;
      }

      const data = await response.json();
      const list: RecruitmentData[] = Array.isArray(data) ? data : [];
      setRecruitments(list);
      // ギルド数を取得
      const uniqueGuilds = new Set(list.map((r: RecruitmentData) => r.guild_id));
      setGuildCount(uniqueGuilds.size);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error fetching recruitments:', error);
    }
  }, []);

  // 手動クリーンアップ関数
  const performCleanup = async () => {
    setIsCleaningUp(true);
    try {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:3000';
  // call the server's protected cleanup runner. If NEXT_PUBLIC_DEPLOY_SECRET is set at build-time,
  // include it as x-deploy-secret. (This is intended for admin usage; do not expose secrets publicly.)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const publicSecret = process.env.NEXT_PUBLIC_DEPLOY_SECRET;
  if (publicSecret) headers['x-deploy-secret'] = publicSecret;

  const response = await fetch(`${backendUrl.replace(/\/$/, '')}/internal/cleanup/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Cleanup result:', result);
        // クリーンアップ後にデータを再取得
        await fetchRecruitments();
        alert(`クリーンアップが完了しました。${result.cleaned_count}件の古い募集を削除しました。`);
      } else {
        console.error('Cleanup failed:', response.statusText);
        alert('クリーンアップに失敗しました。');
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
      alert('クリーンアップ中にエラーが発生しました。');
    } finally {
      setIsCleaningUp(false);
    }
  };  // リアルタイム更新
  useEffect(() => {
    // 初回データ取得
    fetchRecruitments();

    const interval = setInterval(async () => {
      setIsLoading(true);
      try {
        await fetchRecruitments();
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setIsLoading(false);
      }
    }, 5000); // 5秒間隔

    return () => clearInterval(interval);
  }, [fetchRecruitments]);

  const activeRecruitments = recruitments.filter((r: RecruitmentData) => r.status === 'recruiting').length;
  const totalRecruitments = recruitments.length;
  
  // 平均経過時間を計算
  const averageElapsedTime = () => {
  const activeRecs = recruitments.filter((r: RecruitmentData) => r.status === 'recruiting');
    if (activeRecs.length === 0) return 0;
    
    const totalMinutes = activeRecs.reduce((sum: number, rec: RecruitmentData) => {
      const elapsed = new Date().getTime() - new Date(rec.start_time).getTime();
      return sum + Math.floor(elapsed / (1000 * 60));
    }, 0);
    
    return Math.floor(totalMinutes / activeRecs.length);
  };

  // 募集が古いかどうかを判定
  const isOldRecruitment = (startTime: string) => {
    const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000);
    return new Date(startTime) < eightHoursAgo;
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
          <div className="flex items-center space-x-4">
            <button
              onClick={performCleanup}
              disabled={isCleaningUp}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isCleaningUp
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-700 text-white'
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
            {recruitments.filter((r: RecruitmentData) => isOldRecruitment(r.start_time)).length > 0 && (
              <span className="text-red-400 ml-2">
                · {recruitments.filter((r: RecruitmentData) => isOldRecruitment(r.start_time)).length}件の古い募集（8時間以上経過）
              </span>
            )}
          </p>
          <p className="text-gray-500 text-xs mt-1">
            古い募集（赤色表示）は自動的にクリーンアップされます。手動削除も可能です。
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
              {recruitments.map((recruitment: RecruitmentData) => {
                const isOld = isOldRecruitment(recruitment.start_time);
                return (
                  <tr 
                    key={`${recruitment.guild_id}-${recruitment.message_id}`} 
                    className={`transition-colors ${
                      isOld 
                        ? 'bg-red-900/20 hover:bg-red-900/30 border-l-4 border-red-500' 
                        : 'hover:bg-gray-800'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className={`font-medium ${isOld ? 'text-red-300' : 'text-white'}`}>
                          {recruitment.guild_name}
                          {isOld && <span className="ml-2 text-xs bg-red-600 px-2 py-1 rounded-full">古い募集</span>}
                        </p>
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
                    <span className="text-white">{(recruitment.participants_count ?? 0)}</span>
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
                );
              })}
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