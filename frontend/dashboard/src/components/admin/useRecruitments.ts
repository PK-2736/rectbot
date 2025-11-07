"use client";
import { useState, useCallback, useEffect } from 'react';
import type { RecruitmentData } from './types';

export function useRecruitments(initialData?: RecruitmentData[]) {
  const [recruitments, setRecruitments] = useState<RecruitmentData[]>(initialData || []);
  const [guildCount, setGuildCount] = useState<number>(0);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchRecruitments = useCallback(async () => {
    try {
      setFetchError(null);
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.recrubo.net';
      const url = `${apiBaseUrl}/api/recruitment/list`;
      const response = await fetch(url, { cache: 'no-store', credentials: 'include' });

      if (response.status === 401) {
        const redirectUri = process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI || 'https://api.recrubo.net/api/discord/callback';
        const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify`;
        window.location.href = discordAuthUrl;
        return;
      }

      if (!response.ok) {
        let errorDetails = '';
        try {
          const errorData = await response.json();
          errorDetails = errorData.message || errorData.error || '';
          const userMessage = errorData.message || errorData.details || response.statusText;
          setFetchError(`Failed to fetch: ${response.status} - ${userMessage}`);
        } catch (_) {
          const errorMsg = `Failed to fetch: ${response.status} ${response.statusText}`;
          setFetchError(errorMsg);
        }
        return;
      }

      const data = await response.json();
      const list: RecruitmentData[] = Array.isArray(data) ? data : [];
      setRecruitments(list);
      setFetchError(null);

      const uniqueGuilds = new Set(list.map((r: RecruitmentData) => r.guild_id));
      setGuildCount(uniqueGuilds.size);
      setLastUpdate(new Date());
    } catch (error) {
      setFetchError(String(error));
    }
  }, []);

  const performCleanup = useCallback(async () => {
    setIsCleaningUp(true);
    try {
      const response = await fetch('/api/cleanup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (response.ok) {
        await fetchRecruitments();
      }
    } finally {
      setIsCleaningUp(false);
    }
  }, [fetchRecruitments]);

  useEffect(() => {
    fetchRecruitments();
    const interval = setInterval(async () => {
      setIsLoading(true);
      try { await fetchRecruitments(); } catch (_) {} finally { setIsLoading(false); }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchRecruitments]);

  return {
    recruitments,
    guildCount,
    lastUpdate,
    isLoading,
    isCleaningUp,
    fetchError,
    fetchRecruitments,
    performCleanup,
  };
}
