"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { formatDateTime, formatDuration } from '@/lib/utils';

// Use small local fallbacks for icons
const Users = (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>👥</span>;
const Clock = (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>⏱</span>;
const Server = (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>🖥️</span>;
const Activity = (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>⚡</span>;

// 募集データの型定義
interface RecruitmentData {
  id?: string;
  recruitId?: string;
  messageId?: string;
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
  title?: string;
  description?: string;
  maxParticipants?: number;
  currentParticipants?: number;
  createdAt?: string;
  participants?: Array<{ id: string; name: string; }>;
  participantsList?: Array<{ id: string; name: string; }>;
}

interface AdminDashboardProps {
  initialData?: RecruitmentData[];
}

export default function AdminDashboard({ initialData }: AdminDashboardProps) {
  const [recruitments, setRecruitments] = useState<RecruitmentData[]>(initialData || []);
  const [guildCount, setGuildCount] = useState<number>(0);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // 募集データを取得する関数（useCallback で安定化）
  const fetchRecruitments = useCallback(async () => {
    try {
      setFetchError(null);
      // WorkerのAPIエンドポイントを呼び出す（JWT Cookie を含む）
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.recrubo.net';
      const url = `${apiBaseUrl}/api/recruitment/list`;

      console.log('Fetching recruitments from:', url);
      const response = await fetch(url, { 
        cache: 'no-store',
        credentials: 'include' // Cookie を送信
      });

      if (response.status === 401) {
        // 認証エラー → Discord ログインにリダイレクト
  const redirectUri = process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI || 'https://api.recrubo.net/api/discord/callback';
        const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify`;
        window.location.href = discordAuthUrl;
        return;
      }

      if (!response.ok) {
        // エラーレスポンスの詳細を取得
        let errorDetails = '';
        try {
          const errorData = await response.json();
          console.error('API error details:', errorData);
          errorDetails = errorData.message || errorData.error || '';
          
          // デバッグ情報も表示
          if (errorData.debugInfo) {
            console.error('Debug info:', errorData.debugInfo);
          }
          if (errorData.details) {
            console.error('Error details:', errorData.details);
          }
          
          // ユーザーに表示するエラーメッセージ
          const userMessage = errorData.message || errorData.details || response.statusText;
          setFetchError(`Failed to fetch: ${response.status} - ${userMessage}`);
        } catch (e) {
          // JSONパースに失敗した場合
          const errorMsg = `Failed to fetch: ${response.status} ${response.statusText}`;
          console.error('API Route error:', errorMsg);
          setFetchError(errorMsg);
        }
        return;
      }

      const data = await response.json();
      const list: RecruitmentData[] = Array.isArray(data) ? data : [];
      
      console.log(`Fetched ${list.length} recruitments from API`);
      console.log('Recruitment data:', list);
      
      setRecruitments(list);
      setFetchError(null);
      
      const uniqueGuilds = new Set(list.map((r: RecruitmentData) => r.guild_id));
      setGuildCount(uniqueGuilds.size);
      setLastUpdate(new Date());
      
      console.log(`Total recruitments: ${list.length}`);
      console.log(`Active recruitments: ${list.filter(r => r.status === 'recruiting').length}`);
      console.log(`Unique guilds: ${uniqueGuilds.size}`);
    } catch (error) {
      console.error('Error fetching recruitments:', error);
      setFetchError(String(error));
    }
  }, []);

  // 手動クリーンアップ関数
  const performCleanup = async () => {
    setIsCleaningUp(true);
    try {
      // Next.js API Route を経由してクリーンアップを実行（トークンはサーバーサイドで付与）
      const response = await fetch('/api/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Cleanup result:', result);
        await fetchRecruitments();
        alert(`クリーンアップが完了しました。削除件数: ${result.deletedRecruitCount || 0}件`);
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
  };

  // リアルタイム更新
  useEffect(() => {
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
    }, 5000);

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
      {fetchError && (
        <div className="mb-6 p-4 bg-red-700 text-white rounded">
          <strong>データ取得エラー:</strong>
          <div className="mt-1 text-sm">{fetchError}</div>
        </div>
      )}
      
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
                const recruitKey = recruitment.id || recruitment.recruitId || recruitment.message_id || `${recruitment.guild_id}-${recruitment.message_id}`;
                
                return (
                  <tr 
                    key={recruitKey}
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
                        <p className="text-white">{recruitment.content || recruitment.title}</p>
                        {recruitment.note && (
                          <p className="text-xs text-gray-400 mt-1">{recruitment.note}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-white">{recruitment.participants_count ?? recruitment.currentParticipants ?? 0}</span>
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