// ギルド募集状態の型定義
export interface RecruitmentState {
  channelId: string;
  recruitCount: number;
  startTime: string;
}

// ギルド設定の型定義
export interface GuildSettings {
  guild_id: string;
  base_limit: number;
  sub_limit: number;
  is_subscribed: boolean;
  notify_role_id: string;
  recruit_channel_id: string;
  panel_main_color: string;
  created_at: string;
  updated_at: string;
}

// ギルド情報（Discord APIから取得）
export interface GuildInfo {
  id: string;
  name: string;
  icon?: string;
  owner: boolean;
  permissions: string;
}

// ダッシュボード表示用のギルドデータ
export interface DashboardGuild {
  guild_id: string;
  guild_name: string;
  channel_name: string;
  current_recruits: number;
  base_limit: number;
  sub_limit: number;
  is_subscribed: boolean;
  start_time?: string;
  status: 'recruiting' | 'ended' | 'cancelled' | 'idle';
  panel_color: string;
}

// ユーザーのサブスクリプション情報
export interface UserSubscription {
  guild_id: string;
  guild_name: string;
  is_subscribed: boolean;
  sub_code_applied: boolean;
  subscription_start?: string;
  subscription_end?: string;
}

// APIレスポンス型
export interface DashboardData {
  guilds: DashboardGuild[];
  userSubscriptions: UserSubscription[];
  isAdmin: boolean;
}