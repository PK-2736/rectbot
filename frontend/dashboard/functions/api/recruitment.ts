// Cloudflare Pages Function
// /api/recruitment エンドポイント

interface Env {
  BACKEND_API_URL?: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
  DEPLOY_SECRET?: string;
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  try {
    const { env } = context;
    
    // バックエンド API の URL を取得
  const backendUrl = env.BACKEND_API_URL || 'https://api.recrubo.net';
    const url = `${backendUrl.replace(/\/$/, '')}/api/recruitment/list`;

    // Service Token をサーバーサイドで付与
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const serviceToken = env.CF_ACCESS_CLIENT_SECRET || env.DEPLOY_SECRET;
    const clientId = env.CF_ACCESS_CLIENT_ID;

    if (serviceToken) {
      if (clientId) {
        // Cloudflare Access Service Token
        headers['CF-Access-Client-Id'] = clientId;
        headers['CF-Access-Client-Secret'] = serviceToken;
      } else {
        // 単純な Bearer トークン
        headers['Authorization'] = `Bearer ${serviceToken}`;
      }
    }

    // バックエンド API にリクエスト
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return new Response(
        JSON.stringify({ error: `Backend API error: ${response.status}` }),
        { 
          status: response.status,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('Error fetching recruitment data:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
