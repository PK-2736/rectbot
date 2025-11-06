// utils/discordOAuth.js
import { resolveSupabaseRestUrl, getSupabaseClient } from '../supabase.js';
import { isAdmin, issueJWT } from './auth.js';

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
  const data = await res.json();
  return data;
}

async function getDiscordUser(accessToken) {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

export async function handleDiscordCallback(code, env) {
  const tokenData = await getDiscordToken(
    code,
    env.DISCORD_REDIRECT_URI,
    env.DISCORD_CLIENT_ID,
    env.DISCORD_CLIENT_SECRET
  );

  if (!tokenData.access_token) {
    throw new Error(`Failed to get Discord access token: ${tokenData.error || 'unknown error'} - ${tokenData.error_description || 'no description'}`);
  }

  const userInfo = await getDiscordUser(tokenData.access_token);

  try {
    const supabaseRestUrl = resolveSupabaseRestUrl(env);
    if (supabaseRestUrl && env.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = getSupabaseClient(env);
      await supabase.from('users').upsert({
        user_id: userInfo.id,
        discord_id: userInfo.id,
        username: userInfo.username,
        discriminator: userInfo.discriminator || '0',
        avatar: userInfo.avatar,
        role: isAdmin(userInfo.id, env) ? 'admin' : 'user',
        last_login: new Date().toISOString()
      });
    }
  } catch (e) {
    console.error('Failed to save user to Supabase (non-fatal):', e);
  }

  const jwt = await issueJWT(userInfo, env);
  return { jwt, userInfo };
}
