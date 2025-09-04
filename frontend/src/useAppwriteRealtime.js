// Appwrite Realtime購読のReact用カスタムフック例
// ファイル名: useAppwriteRealtime.js
import { useEffect } from 'react';
import { Client } from 'appwrite';

const APPWRITE_ENDPOINT = process.env.REACT_APP_APPWRITE_ENDPOINT || 'https://auth.pwy.rectbot.tech/v1';
const APPWRITE_PROJECT = process.env.REACT_APP_APPWRITE_PROJECT || '68b0fdf5000d03a7e766';

export function useAppwriteRealtime(channel, onEvent) {
  useEffect(() => {
    const client = new Client();
    client.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT);
    const unsubscribe = client.subscribe(channel, onEvent);
    return () => unsubscribe();
  }, [channel, onEvent]);
}

