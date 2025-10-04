'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { DiscordUser, discordAuth } from '@/lib/discord-auth';

interface AuthContextType {
  user: DiscordUser | null;
  isAdmin: boolean;
  login: () => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  login: () => {},
  logout: () => {},
  isLoading: true,
});

export const useAuth = (): AuthContextType => useContext(AuthContext) as AuthContextType;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<DiscordUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Cookie から JWT をチェック
    const checkAuth = async () => {
      try {
        // Worker の /api/recruitment/list を呼び出して認証状態を確認
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.rectbot.tech';
        const response = await fetch(`${apiBaseUrl}/api/recruitment/list`, {
          credentials: 'include', // Cookie を送信
        });

        if (response.ok) {
          // 認証成功 - ユーザー情報を取得
          // 実際のユーザー情報はレスポンスから取得する必要がありますが、
          // 今は簡易的にダミー情報を設定
          const authUser: DiscordUser = {
            id: 'authenticated',
            username: 'Admin User',
            discriminator: '0000',
            email: '',
          };
          setUser(authUser);
          console.log('User authenticated via cookie');
        } else if (response.status === 401) {
          // 認証失敗
          console.log('User not authenticated');
          setUser(null);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = () => {
    const authUrl = discordAuth.getAuthUrl();
    window.location.href = authUrl;
  };

  const logout = () => {
    setUser(null);
    discordAuth.removeUser();
  };

  const isAdmin = user ? discordAuth.isAdmin(user.id) : false;

  return (
    <AuthContext.Provider value={{ user, isAdmin, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}