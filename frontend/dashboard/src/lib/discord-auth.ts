export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  email?: string;
}

export class DiscordAuth {
  private clientId: string;
  private redirectUri: string;
  private adminIds: string[];

  constructor() {
    this.clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || '';
    this.redirectUri = process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI || 
      (typeof window !== 'undefined' ? `${window.location.origin}/` : 'http://localhost:3000/');
    
    // 環境変数から管理者IDを取得（カンマ区切りで複数指定可能）
    const adminIdsEnv = process.env.NEXT_PUBLIC_ADMIN_IDS || process.env.ADMIN_IDS || '';
    this.adminIds = adminIdsEnv 
      ? adminIdsEnv.split(',').map(id => id.trim()).filter(id => id.length > 0)
      : ["1048950201974542477", "726195003780628621"]; // デフォルトで両方のIDを含める
  }

  getAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'identify email',
    });
    
    return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCode(): Promise<DiscordUser | null> {
    try {
      // クライアントサイドではクロスオリジンリクエストができないため、
      // バックエンドプロキシまたは別の方法が必要
      // ここでは簡略化して、アクセストークンを直接使用する想定
      console.warn('Discord OAuth2 code exchange needs backend implementation');
      return null;
    } catch (error) {
      console.error('Failed to exchange Discord code:', error);
      return null;
    }
  }

  isAdmin(userId: string): boolean {
    // 開発モード: 環境変数でデバッグモードを有効にする
    if (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_DEBUG_MODE === 'true') {
      console.log('Debug mode: User ID:', userId);
      console.log('Admin IDs:', this.adminIds);
      
      // デバッグモードでは一時的に全ユーザーを管理者として扱う
      return true;
    }
    
    return this.adminIds.includes(userId);
  }

  // ローカルストレージからユーザー情報を取得
  getStoredUser(): DiscordUser | null {
    if (typeof window === 'undefined') return null;
    
    const stored = localStorage.getItem('discord_user');
    return stored ? JSON.parse(stored) : null;
  }

  // ローカルストレージにユーザー情報を保存
  storeUser(user: DiscordUser): void {
    if (typeof window === 'undefined') return;
    
    localStorage.setItem('discord_user', JSON.stringify(user));
  }

  // ローカルストレージからユーザー情報を削除
  removeUser(): void {
    if (typeof window === 'undefined') return;
    
    localStorage.removeItem('discord_user');
  }
}

export const discordAuth = new DiscordAuth();