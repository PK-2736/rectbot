// Discord OAuth用
async function getDiscordToken(code, redirectUri, clientId, clientSecret) {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    scope: 'identify email',
  });
  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  return res.json();
}

async function getDiscordUser(accessToken) {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Discord OAuthコールバックAPI
    if (request.method === 'POST' && url.pathname === '/api/discord/callback') {
      const { code } = await request.json();
      if (!code) return new Response(JSON.stringify({ error: 'code missing' }), { status: 400 });
      // 環境変数からDiscord情報取得
      const clientId = env.REACT_APP_DISCORD_CLIENT_ID;
      const clientSecret = env.DISCORD_CLIENT_SECRET;
      const redirectUri = env.REACT_APP_DISCORD_REDIRECT_URI;
      // Discordトークン取得
      const tokenData = await getDiscordToken(code, redirectUri, clientId, clientSecret);
      if (!tokenData.access_token) {
        return new Response(JSON.stringify({ error: 'discord token error', detail: tokenData }), { status: 400 });
      }
      // Discordユーザー情報取得
      const user = await getDiscordUser(tokenData.access_token);
      // 必要ならSupabaseに保存
      // await supabase.from('users').upsert({ discord_id: user.id, username: user.username, email: user.email });
      return new Response(JSON.stringify({ user }), { status: 200 });
    }
    if (request.method === 'POST' && url.pathname === '/webhook') {
      const sig = request.headers.get('stripe-signature');
      const body = await request.text();
      try {
        const event = stripe.webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET);
        // ここでevent.typeやevent.data.objectを使ってSupabaseにサブスク情報を保存
        // 例: await supabase.from('subscriptions').upsert({ ... });
        return new Response('Webhook received', { status: 200 });
      } catch (err) {
        return new Response('Webhook Error', { status: 400 });
      }
    }
    return new Response('OK');
  }
}
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const supabase = createClient(
  'https://your-supabase-url.supabase.co',
  'your-service-role-key'
);
const stripe = new Stripe('sk_test_your_stripe_key');
