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

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<DiscordUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 初期化時にローカルストレージから認証情報を復元
    const storedUser = discordAuth.getStoredUser();
    if (storedUser) {
      setUser(storedUser);
    }

    // URLからDiscordの認証成功パラメータをチェック
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const authSuccess = urlParams.get('auth_success');
      const userId = urlParams.get('user_id');
      const username = urlParams.get('username');
      
      if (authSuccess === 'true' && userId && username) {
        // バックエンドから認証成功のリダイレクトを受信
        console.log('Discord auth success received');
        
        const authUser: DiscordUser = {
          id: userId,
          username: username,
          discriminator: "0000", // 新しいDiscordは discriminator が不要
          email: "" // 必要に応じてバックエンドから受け取る
        };
        
        setUser(authUser);
        discordAuth.storeUser(authUser);
        
        // URLからパラメータを削除してクリーンアップ
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      } else {
        // 従来のコード処理（デモ用）
        const code = urlParams.get('code');
        if (code) {
          console.log('Discord auth code received (legacy):', code);
          
          // デモ用: 固定のユーザー情報をセット
          const demoUser: DiscordUser = {
            id: "1048950201974542477",
            username: "admin",
            discriminator: "0001",
            email: "admin@example.com"
          };
          
          setUser(demoUser);
          discordAuth.storeUser(demoUser);
          
          // URLからコードパラメータを削除
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
        }
      }
    }

    setIsLoading(false);
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