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
    // Cookie から JWT をチェックしてユーザー情報を取得
    const checkAuth = async () => {
      try {
        // Worker の /api/auth/me を呼び出して認証状態とユーザー情報を確認
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.recrubo.net';
        const response = await fetch(`${apiBaseUrl}/api/auth/me`, {
          credentials: 'include', // Cookie を送信
        });

        if (response.ok) {
          // 認証成功 - 実際のユーザー情報を取得
          const data = await response.json();
          const authUser: DiscordUser = {
            id: data.id,
            username: data.username,
            discriminator: '0',
            email: '',
          };
          setUser(authUser);
          console.log('User authenticated:', data);
          console.log('User ID:', data.id);
          console.log('User role:', data.role);
          console.log('Is admin:', data.isAdmin);
        } else if (response.status === 401) {
          // 認証失敗
          console.log('User not authenticated');
          setUser(null);
        } else {
          console.error('Unexpected response:', response.status);
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