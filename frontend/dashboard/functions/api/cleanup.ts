// Cloudflare Pages Function
// /api/cleanup エンドポイント

interface Env {
  BACKEND_API_URL?: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
  DEPLOY_SECRET?: string;
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const { request, env } = context;
    
    // バックエンド API の URL を取得
    const backendUrl = env.BACKEND_API_URL || 'https://api.rectbot.tech';
    const url = `${backendUrl.replace(/\/$/, '')}/internal/cleanup/run`;

    // Service Token をサーバーサイドで付与
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const deploySecret = env.DEPLOY_SECRET;
    if (deploySecret) {
      headers['x-deploy-secret'] = deploySecret;
    }

    const serviceToken = env.CF_ACCESS_CLIENT_SECRET;
    const clientId = env.CF_ACCESS_CLIENT_ID;

    if (serviceToken && clientId) {
      headers['CF-Access-Client-Id'] = clientId;
      headers['CF-Access-Client-Secret'] = serviceToken;
    }

    // リクエストボディを取得（あれば）
    let body = {};
    try {
      body = await request.json();
    } catch {
      // ボディがない場合は空オブジェクト
    }

    // バックエンド API にリクエスト
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
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
      },
    });
  } catch (error) {
    console.error('Error during cleanup:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
