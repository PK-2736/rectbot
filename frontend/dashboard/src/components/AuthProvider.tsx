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

    // URLからDiscordの認証コードをチェック
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      
      if (code) {
        // 認証コードがある場合の処理
        // 実際の実装では、バックエンドでコード交換を行う
        console.log('Discord auth code received:', code);
        
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