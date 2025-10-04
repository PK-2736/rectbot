// 管理者判定
const ADMIN_IDS = process.env.NEXT_PUBLIC_ADMIN_IDS?.split(',') || [];

export function isAdmin(userId: string): boolean {
  return ADMIN_IDS.includes(userId);
}

// Discord OAuth2 設定（クライアントサイド用）
export const DISCORD_CONFIG = {
  clientId: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
  redirectUri: process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI || 'https://api.rectbot.tech/api/discord/callback',
};

// API エンドポイント
export const API_ENDPOINTS = {
  recruitment: process.env.RECRUITMENT_API_URL || '/api/recruitment',
  guilds: process.env.GUILDS_API_URL || '/api/guilds',
};

// リアルタイム更新間隔（ミリ秒）
export const REALTIME_INTERVAL = 5000; // 5秒

// ステータス色の定義
export const STATUS_COLORS = {
  recruiting: 'bg-green-500',
  ended: 'bg-gray-500',
  cancelled: 'bg-red-500',
  idle: 'bg-blue-500',
} as const;

// プログレスバーの色分け
export function getProgressColor(current: number, limit: number): string {
  const percentage = (current / limit) * 100;
  
  if (percentage >= 90) return 'bg-red-500';
  if (percentage >= 70) return 'bg-yellow-500';
  return 'bg-green-500';
}