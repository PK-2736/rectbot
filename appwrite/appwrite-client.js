// Appwrite JS SDK クライアント初期化・Realtime購読サンプル
// ファイル名: appwrite-client.js

import { Client, Realtime } from 'appwrite';

// .envや環境変数からエンドポイント・プロジェクトIDを取得する場合は適宜修正
const APPWRITE_ENDPOINT = process.env.REACT_APP_APPWRITE_ENDPOINT || 'https://auth.pwy.rectbot.tech/v1';
const APPWRITE_PROJECT = process.env.REACT_APP_APPWRITE_PROJECT || '68b0fdf5000d03a7e766';

const client = new Client();
client
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT);

const realtime = new Realtime(client);

// 例: 全コレクションの変更を購読
const unsubscribe = realtime.subscribe('collections', response => {
  console.log('Realtime event:', response);
});

// 必要に応じてunsubscribe()で購読解除

export { client, realtime, unsubscribe };
