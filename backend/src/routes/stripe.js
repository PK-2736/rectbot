// Stripe 決済ルート
import { jsonResponse } from '../worker/http.js';
import { verifyInternalAuth } from '../worker/auth.js';
import { verifyJWT } from '../worker/utils/auth.js';

export async function handleStripeRoutes(request, url, env) {
  const pathname = url.pathname;

  // Bot向け: Checkout URL 作成（内部認証必須）
  if (pathname === '/api/stripe/bot/create-checkout-link' && request.method === 'POST') {
    return createCheckoutLinkForBot(request, env);
  }

  // Bot向け: Billing Portal URL 作成（内部認証必須）
  if (pathname === '/api/stripe/bot/create-portal-link' && request.method === 'POST') {
    return createPortalLinkForBot(request, env);
  }

  // Bot向け: サブスク状態取得（内部認証必須）
  if (pathname === '/api/stripe/bot/subscription-status' && request.method === 'GET') {
    return getSubscriptionStatusForBot(request, url, env);
  }

  // Dashboard向け: サブスク状態取得（JWT認証）
  if (pathname === '/api/stripe/subscription-status' && request.method === 'GET') {
    return getSubscriptionStatusForDashboard(request, env);
  }

  // Dashboard向け: Billing Portal URL 作成（JWT認証）
  if (pathname === '/api/stripe/create-portal-link' && request.method === 'POST') {
    return createPortalLinkForDashboard(request, env);
  }

  // Stripe Checkout セッション作成
  if (pathname === '/api/stripe/create-checkout-session' && request.method === 'POST') {
    return createCheckoutSession(request, env);
  }

  // Stripe Webhook (決済完了通知など)
  if (pathname === '/api/stripe/webhook' && request.method === 'POST') {
    return handleStripeWebhook(request, env);
  }

  // 決済成功ページへのリダイレクト用
  if (pathname === '/api/stripe/success' && request.method === 'GET') {
    return handleSuccess(request, env);
  }

  // 決済キャンセルページへのリダイレクト用
  if (pathname === '/api/stripe/cancel' && request.method === 'GET') {
    return handleCancel(request, env);
  }

  return null;
}

function getDashboardUrl(env) {
  return env.DASHBOARD_URL || 'https://dash.recrubo.net';
}

function resolveSupabaseServiceKey(env) {
  return env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || null;
}

const BASE_SUBSCRIPTION_SELECT = 'user_id, stripe_subscription_id, stripe_customer_id, status, created_at, updated_at';
const EXTENDED_SUBSCRIPTION_SELECT = `${BASE_SUBSCRIPTION_SELECT}, purchased_guild_id, checkout_session_id, stripe_price_id, currency, amount, billing_interval, current_period_start, current_period_end, cancel_at_period_end, last_checkout_at`;

function isMissingDbColumnError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('column') && message.includes('does not exist');
}

function isMissingDbRelationError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('relation') && message.includes('does not exist');
}

function toIsoOrNull(unixSeconds) {
  const n = Number(unixSeconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

async function createSupabaseClient(env) {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseServiceKey = resolveSupabaseServiceKey(env);
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[stripe] Supabase is not configured:', {
      SUPABASE_URL_exists: !!supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY_exists: !!env.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_SERVICE_KEY_exists: !!env.SUPABASE_SERVICE_KEY
    });
    return null;
  }

  const { createClient } = await import('@supabase/supabase-js');
  return createClient(supabaseUrl, supabaseServiceKey);
}

function getStripePriceId(env, bodyPriceId) {
  return bodyPriceId || env.STRIPE_PREMIUM_PRICE_ID || env.STRIPE_PRICE_ID || null;
}

function getStripePriceIdForBot(env, bodyPriceId) {
  // Internal bot route should prioritize backend env to avoid cross-service mode drift.
  return env.STRIPE_PREMIUM_PRICE_ID || env.STRIPE_PRICE_ID || bodyPriceId || null;
}

function detectStripeKeyMode(secretKey) {
  if (typeof secretKey !== 'string') return 'unknown';
  if (secretKey.startsWith('sk_test_')) return 'test';
  if (secretKey.startsWith('sk_live_')) return 'live';
  return 'unknown';
}

function mapStripeError(error, env) {
  const statusCode = Number(error?.statusCode || 0);
  const message = String(error?.message || '');
  const lowerMessage = message.toLowerCase();
  const keyMode = detectStripeKeyMode(env?.STRIPE_SECRET_KEY);

  if (lowerMessage.includes('creating a checkout session in testmode without an existing customer')) {
    return {
      status: statusCode || 400,
      payload: {
        error: 'Stripe Checkout requires an existing customer in test mode (Accounts V2).',
        hint: 'Create/reuse a Stripe Customer first, then pass customer to checkout.sessions.create. Alternatively test via Stripe Sandbox.'
      }
    };
  }

  if (lowerMessage.includes('no such price')) {
    if (lowerMessage.includes('live mode') && keyMode === 'test') {
      return {
        status: 400,
        payload: {
          error: 'Stripe mode mismatch: live price ID is being requested with a test secret key.',
          hint: 'Set STRIPE_SECRET_KEY and STRIPE_PREMIUM_PRICE_ID/STRIPE_PRICE_ID to the same mode (both test or both live).'
        }
      };
    }

    if (lowerMessage.includes('test mode') && keyMode === 'live') {
      return {
        status: 400,
        payload: {
          error: 'Stripe mode mismatch: test price ID is being requested with a live secret key.',
          hint: 'Set STRIPE_SECRET_KEY and STRIPE_PREMIUM_PRICE_ID/STRIPE_PRICE_ID to the same mode (both test or both live).'
        }
      };
    }

    return {
      status: statusCode || 400,
      payload: {
        error: message || 'Invalid Stripe price ID.',
        hint: 'Verify STRIPE_PREMIUM_PRICE_ID/STRIPE_PRICE_ID exists in the same Stripe account/mode as STRIPE_SECRET_KEY.'
      }
    };
  }

  if (statusCode >= 400 && statusCode < 500) {
    return {
      status: statusCode,
      payload: { error: message || 'Stripe request failed.' }
    };
  }

  return null;
}

async function createStripeClient(env) {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured. Please set it in Cloudflare Workers secrets.');
  }

  const Stripe = (await import('stripe')).default;
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-10-28.acacia',
  });
}

async function resolveOrCreateStripeCustomerId({ userId, email, username, env, stripe }) {
  const subscription = await fetchLatestSubscriptionByUserId(userId, env);
  const fromDb = String(subscription?.stripe_customer_id || '').trim();
  if (fromDb) return fromDb;

  const existing = await stripe.customers.list({
    email: email || undefined,
    limit: 20,
  });
  const matched = Array.isArray(existing?.data)
    ? existing.data.find((customer) => String(customer?.metadata?.userId || '') === userId)
    : null;
  if (matched?.id) return matched.id;

  const created = await stripe.customers.create({
    email: email || undefined,
    name: username || undefined,
    metadata: {
      userId,
      source: 'recrubo',
    },
  });
  return created.id;
}

async function createCheckoutLinkForBot(request, env) {
  try {
    if (!await verifyInternalAuth(request, env)) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const userId = String(body?.userId || '').trim();
    const guildId = String(body?.guildId || '').trim();
    const priceId = getStripePriceIdForBot(env, body?.priceId);
    const dashboardUrl = getDashboardUrl(env);

    if (!userId) {
      return jsonResponse({ error: 'userId is required' }, 400);
    }
    if (!guildId || guildId === 'dm') {
      return jsonResponse({ error: 'guildId is required for subscription purchase' }, 400);
    }
    if (!priceId) {
      return jsonResponse({ error: 'priceId is required (or set STRIPE_PREMIUM_PRICE_ID)' }, 400);
    }

    const stripe = await createStripeClient(env);
    const customerId = await resolveOrCreateStripeCustomerId({
      userId,
      email: null,
      username: null,
      env,
      stripe,
    });
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${dashboardUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${dashboardUrl}/cancel`,
      customer: customerId,
      client_reference_id: userId,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
          userId,
          guildId,
          source: 'discord_bot'
        }
      },
      metadata: {
        userId,
        guildId,
        source: 'discord_bot'
      }
    });

    return jsonResponse({
      sessionId: session.id,
      checkoutUrl: session.url,
      expiresAt: session.expires_at || null
    });
  } catch (error) {
    console.error('Error creating checkout link for bot:', error);
    const stripeMappedError = mapStripeError(error, env);
    if (stripeMappedError) {
      return jsonResponse(stripeMappedError.payload, stripeMappedError.status);
    }

    const errorMessage = error.message || 'Failed to create checkout link';
    const errorDetails = {
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
    return jsonResponse(errorDetails, 500);
  }
}

async function fetchLatestSubscriptionByUserId(userId, env) {
  const supabase = await createSupabaseClient(env);
  if (!supabase) return null;

  const extended = await supabase
    .from('subscriptions')
    .select(EXTENDED_SUBSCRIPTION_SELECT)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!extended.error) {
    return extended.data || null;
  }

  if (!isMissingDbColumnError(extended.error)) {
    console.error('[stripe] Failed to fetch subscription status:', extended.error);
    return null;
  }

  // Fallback for environments where migration has not been applied yet.
  const base = await supabase
    .from('subscriptions')
    .select(BASE_SUBSCRIPTION_SELECT)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (base.error) {
    console.error('[stripe] Failed to fetch subscription status (fallback):', base.error);
    return null;
  }

  return base.data || null;
}

async function fetchLatestPurchaseByUserId(userId, env) {
  const supabase = await createSupabaseClient(env);
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('subscription_purchases')
    .select('user_id, purchased_guild_id, stripe_checkout_session_id, stripe_subscription_id, stripe_customer_id, stripe_price_id, amount, currency, billing_interval, purchased_at')
    .eq('user_id', userId)
    .order('purchased_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (!isMissingDbRelationError(error) && !isMissingDbColumnError(error)) {
      console.error('[stripe] Failed to fetch latest purchase:', error);
    }
    return null;
  }

  return data || null;
}

async function fetchGuildSubscriptionStatus(guildId, env) {
  const supabase = await createSupabaseClient(env);
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('guild_settings')
    .select('guild_id, premium_enabled, premium_subscription_id, premium_updated_at, enable_dedicated_channel')
    .eq('guild_id', guildId)
    .maybeSingle();

  if (error) {
    if (!isMissingDbColumnError(error) && !isMissingDbRelationError(error)) {
      console.error('[stripe] Failed to fetch guild subscription status:', error);
    }
    return null;
  }

  return data || null;
}

async function setGuildSubscriptionState(guildId, subscriptionId, enabled, env) {
  if (!guildId) return;

  const supabase = await createSupabaseClient(env);
  if (!supabase) return;

  const nowIso = new Date().toISOString();
  const fullPayload = {
    guild_id: guildId,
    premium_enabled: !!enabled,
    premium_subscription_id: subscriptionId || null,
    premium_updated_at: nowIso,
    enable_dedicated_channel: !!enabled,
    updated_at: nowIso,
  };

  const { error } = await supabase
    .from('guild_settings')
    .upsert(fullPayload, { onConflict: 'guild_id' });

  if (error && isMissingDbColumnError(error)) {
    const fallbackPayload = {
      guild_id: guildId,
      enable_dedicated_channel: !!enabled,
      updated_at: nowIso,
    };

    const fallback = await supabase
      .from('guild_settings')
      .upsert(fallbackPayload, { onConflict: 'guild_id' });

    if (fallback.error) {
      console.error('[stripe] Failed to update guild subscription state (fallback):', fallback.error);
    }
  } else if (error) {
    console.error('[stripe] Failed to update guild subscription state:', error);
  }
}

function isActiveOrTrialing(status) {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'active' || normalized === 'trialing';
}

async function upsertSubscriptionFromStripe({ subscription, userId, guildId, env }) {
  const supabase = await createSupabaseClient(env);
  if (!supabase || !subscription?.id || !userId) return;

  const price = subscription?.items?.data?.[0]?.price || null;
  const nowIso = new Date().toISOString();
  const purchasedGuildId = String(guildId || subscription?.metadata?.guildId || '').trim() || null;
  const customerId = typeof subscription?.customer === 'string' ? subscription.customer : null;

  const fullPayload = {
    user_id: userId,
    purchased_guild_id: purchasedGuildId,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: customerId,
    status: subscription.status || 'active',
    stripe_price_id: price?.id || null,
    amount: price?.unit_amount ?? null,
    currency: price?.currency || null,
    billing_interval: price?.recurring?.interval || null,
    current_period_start: toIsoOrNull(subscription?.current_period_start),
    current_period_end: toIsoOrNull(subscription?.current_period_end),
    cancel_at_period_end: !!subscription?.cancel_at_period_end,
    updated_at: nowIso,
  };

  const basePayload = {
    user_id: userId,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: customerId,
    status: subscription.status || 'active',
    updated_at: nowIso,
  };

  const upsertRes = await supabase
    .from('subscriptions')
    .upsert(fullPayload, { onConflict: 'stripe_subscription_id' });

  if (upsertRes.error && isMissingDbColumnError(upsertRes.error)) {
    const fallbackRes = await supabase
      .from('subscriptions')
      .upsert(basePayload, { onConflict: 'stripe_subscription_id' });
    if (fallbackRes.error) {
      console.error('[stripe] Failed to upsert subscription from Stripe (fallback):', fallbackRes.error);
    }
  } else if (upsertRes.error) {
    console.error('[stripe] Failed to upsert subscription from Stripe:', upsertRes.error);
  }

  await setGuildSubscriptionState(purchasedGuildId, subscription.id, isActiveOrTrialing(subscription.status), env);
}

async function reconcileSubscriptionFromStripe(userId, guildId, env) {
  const stripe = await createStripeClient(env);
  const normalizedGuildId = String(guildId || '').trim();

  try {
    if (typeof stripe.subscriptions.search === 'function') {
      const escapedUserId = userId.replace(/'/g, "\\'");
      const query = `metadata['userId']:'${escapedUserId}'`;
      const result = await stripe.subscriptions.search({ query, limit: 10 });
      const match = (result?.data || []).find((sub) => {
        if (!isActiveOrTrialing(sub?.status)) return false;
        if (!normalizedGuildId) return true;
        return String(sub?.metadata?.guildId || '').trim() === normalizedGuildId;
      });

      if (match) {
        await upsertSubscriptionFromStripe({ subscription: match, userId, guildId: normalizedGuildId || match?.metadata?.guildId, env });
        return true;
      }
    }
  } catch (error) {
    console.warn('[stripe] subscriptions.search reconciliation failed:', error?.message || error);
  }

  for (const status of ['active', 'trialing']) {
    try {
      const listed = await stripe.subscriptions.list({ status, limit: 100 });
      const match = (listed?.data || []).find((sub) => {
        if (String(sub?.metadata?.userId || '') !== String(userId)) return false;
        if (!normalizedGuildId) return true;
        return String(sub?.metadata?.guildId || '').trim() === normalizedGuildId;
      });

      if (match) {
        await upsertSubscriptionFromStripe({ subscription: match, userId, guildId: normalizedGuildId || match?.metadata?.guildId, env });
        return true;
      }
    } catch (error) {
      console.warn(`[stripe] subscriptions.list(${status}) reconciliation failed:`, error?.message || error);
    }
  }

  // Fallback: recover from checkout sessions even when subscription metadata is missing.
  try {
    const sessions = await stripe.checkout.sessions.list({ limit: 100 });
    const matchedSession = (sessions?.data || []).find((session) => {
      if (session?.mode !== 'subscription') return false;
      if (String(session?.client_reference_id || '') !== String(userId)) return false;
      if (!normalizedGuildId) return true;
      return String(session?.metadata?.guildId || '').trim() === normalizedGuildId;
    });

    const subscriptionId = typeof matchedSession?.subscription === 'string'
      ? matchedSession.subscription
      : matchedSession?.subscription?.id;

    if (subscriptionId) {
      const sub = await retrieveSubscription(stripe, subscriptionId);
      await upsertSubscriptionFromStripe({
        subscription: sub,
        userId,
        guildId: normalizedGuildId || matchedSession?.metadata?.guildId || sub?.metadata?.guildId,
        env,
      });
      return true;
    }
  } catch (error) {
    console.warn('[stripe] checkout.sessions reconciliation failed:', error?.message || error);
  }

  return false;
}

function isPremiumStatus(status) {
  return isActiveOrTrialing(status);
}

async function getSubscriptionStatusForBot(request, url, env) {
  try {
    if (!await verifyInternalAuth(request, env)) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const userId = String(url.searchParams.get('userId') || '').trim();
    const guildId = String(url.searchParams.get('guildId') || '').trim();
    if (!userId) {
      return jsonResponse({ error: 'userId is required' }, 400);
    }

    const subscription = await fetchLatestSubscriptionByUserId(userId, env);
    const latestPurchase = await fetchLatestPurchaseByUserId(userId, env);
    const guildSubscription = guildId ? await fetchGuildSubscriptionStatus(guildId, env) : null;
    if (!subscription) {
      const reconciled = await reconcileSubscriptionFromStripe(userId, guildId, env);
      if (reconciled) {
        const recoveredSubscription = await fetchLatestSubscriptionByUserId(userId, env);
        const recoveredLatestPurchase = await fetchLatestPurchaseByUserId(userId, env);
        const recoveredGuildSubscription = guildId ? await fetchGuildSubscriptionStatus(guildId, env) : null;

        if (recoveredSubscription) {
          return jsonResponse({
            hasSubscription: true,
            isPremium: isPremiumStatus(recoveredSubscription.status),
            status: recoveredSubscription.status,
            subscription: recoveredSubscription,
            latestPurchase: recoveredLatestPurchase || null,
            guildSubscription: recoveredGuildSubscription || null,
            reconciledFromStripe: true
          });
        }
      }

      return jsonResponse({
        hasSubscription: false,
        isPremium: false,
        status: 'none',
        latestPurchase: latestPurchase || null,
        guildSubscription: guildSubscription || null
      });
    }

    return jsonResponse({
      hasSubscription: true,
      isPremium: isPremiumStatus(subscription.status),
      status: subscription.status,
      subscription: subscription,
      latestPurchase: latestPurchase || null,
      guildSubscription: guildSubscription || null
    });
  } catch (error) {
    console.error('Error getting subscription status for bot:', error);
    return jsonResponse({ error: 'Failed to get subscription status' }, 500);
  }
}

async function getSubscriptionStatusForDashboard(request, env) {
  try {
    const user = await getUserFromRequest(request, env);
    if (!user?.id) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const userId = String(user.id).trim();
    let subscription = await fetchLatestSubscriptionByUserId(userId, env);
    const latestPurchase = await fetchLatestPurchaseByUserId(userId, env);

    if (!subscription) {
      const reconciled = await reconcileSubscriptionFromStripe(userId, '', env);
      if (reconciled) {
        subscription = await fetchLatestSubscriptionByUserId(userId, env);
      }
    }

    const activeGuildId = String(
      subscription?.purchased_guild_id || latestPurchase?.purchased_guild_id || ''
    ).trim() || null;
    const guildSubscription = activeGuildId
      ? await fetchGuildSubscriptionStatus(activeGuildId, env)
      : null;

    if (!subscription) {
      return jsonResponse({
        hasSubscription: false,
        isPremium: false,
        status: 'none',
        activeGuildId,
        latestPurchase: latestPurchase || null,
        guildSubscription: guildSubscription || null,
      });
    }

    return jsonResponse({
      hasSubscription: true,
      isPremium: isPremiumStatus(subscription.status),
      status: subscription.status,
      subscription,
      activeGuildId,
      latestPurchase: latestPurchase || null,
      guildSubscription: guildSubscription || null,
    });
  } catch (error) {
    console.error('Error getting subscription status for dashboard:', error);
    return jsonResponse({ error: 'Failed to get subscription status' }, 500);
  }
}

async function createPortalLinkForDashboard(request, env) {
  try {
    const user = await getUserFromRequest(request, env);
    if (!user?.id) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const userId = String(user.id).trim();
    let subscription = await fetchLatestSubscriptionByUserId(userId, env);

    if (!subscription?.stripe_customer_id) {
      const reconciled = await reconcileSubscriptionFromStripe(userId, '', env);
      if (reconciled) {
        subscription = await fetchLatestSubscriptionByUserId(userId, env);
      }
    }

    if (!subscription?.stripe_customer_id) {
      return jsonResponse({ error: 'No customer found for user' }, 404);
    }

    const stripe = await createStripeClient(env);
    const dashboardUrl = getDashboardUrl(env);
    const body = await request.json().catch(() => ({}));
    const returnUrl = String(body?.returnUrl || '').trim() || `${dashboardUrl}/subscription`;

    const portal = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: returnUrl,
    });

    return jsonResponse({ portalUrl: portal.url });
  } catch (error) {
    console.error('Error creating portal link for dashboard:', error);
    return jsonResponse({ error: 'Failed to create portal link' }, 500);
  }
}

async function createPortalLinkForBot(request, env) {
  try {
    if (!await verifyInternalAuth(request, env)) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const userId = String(body?.userId || '').trim();
    const returnUrl = String(body?.returnUrl || '').trim() || getDashboardUrl(env);
    if (!userId) {
      return jsonResponse({ error: 'userId is required' }, 400);
    }

    const subscription = await fetchLatestSubscriptionByUserId(userId, env);
    if (!subscription?.stripe_customer_id) {
      return jsonResponse({ error: 'No customer found for user' }, 404);
    }

    const stripe = await createStripeClient(env);
    const portal = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: returnUrl
    });

    return jsonResponse({ portalUrl: portal.url });
  } catch (error) {
    console.error('Error creating portal link for bot:', error);
    return jsonResponse({ error: 'Failed to create portal link' }, 500);
  }
}

async function createCheckoutSession(request, env) {
  try {
    const user = await getUserFromRequest(request, env);
    if (!user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const priceId = getStripePriceId(env, body?.priceId);
    const guildId = String(body?.guildId || '').trim();

    if (!priceId) {
      return jsonResponse({ error: 'priceId is required (or set STRIPE_PREMIUM_PRICE_ID)' }, 400);
    }

    const stripe = await createStripeClient(env);
    const dashboardUrl = env.DASHBOARD_URL || 'https://dash.recrubo.net';
    const customerId = await resolveOrCreateStripeCustomerId({
      userId: user.id,
      email: user.email || null,
      username: user.username || null,
      env,
      stripe,
    });

    const sessionPayload = {
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${dashboardUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${dashboardUrl}/cancel`,
      customer: customerId,
      client_reference_id: user.id,
      subscription_data: {
        metadata: {
          userId: user.id,
          username: user.username,
          source: 'dashboard',
          ...(guildId ? { guildId } : {}),
        },
      },
      metadata: {
        userId: user.id,
        username: user.username,
        ...(guildId ? { guildId } : {}),
      },
    };

    const session = await stripe.checkout.sessions.create(sessionPayload);

    return jsonResponse({
      sessionId: session.id,
      checkoutUrl: session.url || null,
      expiresAt: session.expires_at || null,
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    const stripeMappedError = mapStripeError(error, env);
    if (stripeMappedError) {
      return jsonResponse(stripeMappedError.payload, stripeMappedError.status);
    }
    return jsonResponse({ error: 'Failed to create checkout session' }, 500);
  }
}

async function handleStripeWebhook(request, env) {
  try {
    const sig = request.headers.get('stripe-signature');
    if (!sig) {
      return jsonResponse({ error: 'No signature' }, 400);
    }

    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-10-28.acacia',
    });

    const body = await request.text();
    const event = stripe.webhooks.constructEvent(
      body,
      sig,
      env.STRIPE_WEBHOOK_SECRET
    );

    // イベントの処理
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object, env, stripe);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object, env);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object, env);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return jsonResponse({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return jsonResponse({ error: 'Webhook processing failed' }, 500);
  }
}

async function handleCheckoutSessionCompleted(session, env, stripe) {
  console.log('Checkout session completed:', session.id);
  
  // サブスクリプション情報をデータベースに保存
  // TODO: Supabase または Durable Object を使用してサブスクリプション情報を保存
  const userId = session.client_reference_id || session.metadata?.userId;
  const purchasedGuildId = String(session.metadata?.guildId || '').trim() || null;
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  
  console.log(`User ${userId} subscribed with subscription ${subscriptionId}`);
  
  // 例: Supabase に保存
  const supabase = await createSupabaseClient(env);
  if (!supabase || !userId || !subscriptionId) {
    throw new Error('[stripe] Cannot persist checkout result: missing supabase client, userId, or subscriptionId');
  }

  let fullSession = session;
  let stripeSubscription = null;
  let stripePriceId = null;
  let amount = null;
  let currency = null;
  let billingInterval = null;
  let currentPeriodStart = null;
  let currentPeriodEnd = null;
  let cancelAtPeriodEnd = false;

  try {
    if (session?.id) {
      fullSession = await retrieveCheckoutSession(stripe, session.id);
    }
  } catch (error) {
    console.warn('[stripe] Failed to retrieve checkout session details:', error?.message || error);
  }

  try {
    if (subscriptionId) {
      stripeSubscription = await retrieveSubscription(stripe, subscriptionId);
    }
  } catch (error) {
    console.warn('[stripe] Failed to retrieve subscription details:', error?.message || error);
  }

  const firstLine = fullSession?.line_items?.data?.[0] || null;
  const linePrice = firstLine?.price || null;

  stripePriceId = linePrice?.id || stripeSubscription?.items?.data?.[0]?.price?.id || null;
  amount = linePrice?.unit_amount ?? stripeSubscription?.items?.data?.[0]?.price?.unit_amount ?? null;
  currency = linePrice?.currency || stripeSubscription?.currency || null;
  billingInterval = linePrice?.recurring?.interval || stripeSubscription?.items?.data?.[0]?.price?.recurring?.interval || null;
  currentPeriodStart = toIsoOrNull(stripeSubscription?.current_period_start);
  currentPeriodEnd = toIsoOrNull(stripeSubscription?.current_period_end);
  cancelAtPeriodEnd = !!stripeSubscription?.cancel_at_period_end;

  const nowIso = new Date().toISOString();
  const checkoutSessionId = fullSession?.id || session.id || null;
  const customerId = typeof fullSession?.customer === 'string'
    ? fullSession.customer
    : (typeof session.customer === 'string' ? session.customer : null);

  const fullPayload = {
    user_id: userId,
    purchased_guild_id: purchasedGuildId,
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: customerId,
    status: stripeSubscription?.status || 'active',
    checkout_session_id: checkoutSessionId,
    stripe_price_id: stripePriceId,
    currency,
    amount,
    billing_interval: billingInterval,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: cancelAtPeriodEnd,
    last_checkout_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const basePayload = {
    user_id: userId,
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: customerId,
    status: stripeSubscription?.status || 'active',
    created_at: nowIso,
    updated_at: nowIso,
  };

  const subscriptionUpsert = await supabase.from('subscriptions').upsert(fullPayload, { onConflict: 'stripe_subscription_id' });
  if (subscriptionUpsert.error && isMissingDbColumnError(subscriptionUpsert.error)) {
    const fallbackUpsert = await supabase.from('subscriptions').upsert(basePayload, { onConflict: 'stripe_subscription_id' });
    if (fallbackUpsert.error) {
      console.error('[stripe] Failed to upsert subscriptions (fallback):', fallbackUpsert.error);
      throw new Error(`[stripe] Failed to upsert subscriptions (fallback): ${fallbackUpsert.error.message || fallbackUpsert.error}`);
    }
  } else if (subscriptionUpsert.error) {
    console.error('[stripe] Failed to upsert subscriptions:', subscriptionUpsert.error);
    throw new Error(`[stripe] Failed to upsert subscriptions: ${subscriptionUpsert.error.message || subscriptionUpsert.error}`);
  }

  const purchasePayload = {
    user_id: userId,
    purchased_guild_id: purchasedGuildId,
    stripe_checkout_session_id: checkoutSessionId,
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: customerId,
    stripe_price_id: stripePriceId,
    amount,
    currency,
    billing_interval: billingInterval,
    purchased_at: nowIso,
  };

  const purchaseInsert = await supabase.from('subscription_purchases').insert(purchasePayload);
  if (purchaseInsert.error && !isMissingDbRelationError(purchaseInsert.error) && !isMissingDbColumnError(purchaseInsert.error)) {
    console.error('[stripe] Failed to insert subscription purchase:', purchaseInsert.error);
    throw new Error(`[stripe] Failed to insert subscription purchase: ${purchaseInsert.error.message || purchaseInsert.error}`);
  }

  await setGuildSubscriptionState(purchasedGuildId, subscriptionId, true, env);
}

async function retrieveCheckoutSession(stripe, sessionId) {
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['line_items.data.price']
  });
}

async function retrieveSubscription(stripe, subscriptionId) {
  return stripe.subscriptions.retrieve(subscriptionId);
}

async function handleSubscriptionUpdated(subscription, env) {
  console.log('Subscription updated:', subscription.id);

  const supabase = await createSupabaseClient(env);
  if (!supabase) return;

  let purchasedGuildId = null;
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('purchased_guild_id')
    .eq('stripe_subscription_id', subscription.id)
    .maybeSingle();
  purchasedGuildId = String(existing?.purchased_guild_id || '').trim() || null;

  const price = subscription?.items?.data?.[0]?.price || null;
  const updatePayload = {
    status: subscription?.status || 'active',
    stripe_price_id: price?.id || null,
    amount: price?.unit_amount ?? null,
    currency: price?.currency || null,
    billing_interval: price?.recurring?.interval || null,
    current_period_start: toIsoOrNull(subscription?.current_period_start),
    current_period_end: toIsoOrNull(subscription?.current_period_end),
    cancel_at_period_end: !!subscription?.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('subscriptions')
    .update(updatePayload)
    .eq('stripe_subscription_id', subscription.id);

  if (error && isMissingDbColumnError(error)) {
    const fallback = await supabase
      .from('subscriptions')
      .update({
        status: subscription?.status || 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_subscription_id', subscription.id);

    if (fallback.error) {
      console.error('[stripe] Failed to update subscription (fallback):', fallback.error);
    }
  } else if (error) {
    console.error('[stripe] Failed to update subscription:', error);
  }

  const active = isPremiumStatus(subscription?.status);
  await setGuildSubscriptionState(purchasedGuildId, subscription.id, active, env);
}

async function handleSubscriptionDeleted(subscription, env) {
  console.log('Subscription deleted:', subscription.id);

  const supabase = await createSupabaseClient(env);
  if (supabase) {
    let purchasedGuildId = null;

    const { data: existing } = await supabase
      .from('subscriptions')
      .select('purchased_guild_id')
      .eq('stripe_subscription_id', subscription.id)
      .maybeSingle();

    purchasedGuildId = String(existing?.purchased_guild_id || '').trim() || null;

    await supabase.from('subscriptions')
      .update({ status: 'canceled', cancel_at_period_end: false, updated_at: new Date().toISOString() })
      .eq('stripe_subscription_id', subscription.id);

    await setGuildSubscriptionState(purchasedGuildId, subscription.id, false, env);
  }
}

async function getUserFromRequest(request, _env) {
  try {
    // Cookie から JWT(jwt=...) を取得
    const cookies = request.headers.get('Cookie') || '';
    const jwt = cookies.split(';')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith('jwt='))
      ?.slice(4);

    if (!jwt) {
      return null;
    }

    const payload = await verifyJWT(decodeURIComponent(jwt), _env);
    if (!payload?.userId) {
      return null;
    }

    return {
      id: payload.userId,
      username: payload.username,
      email: payload.email,
    };
  } catch (error) {
    console.error('Error getting user from request:', error);
    return null;
  }
}

async function handleSuccess(request, env) {
  // 成功ページへリダイレクト（フロントエンドで処理）
  return new Response(null, {
    status: 302,
    headers: {
      'Location': `${env.DASHBOARD_URL || 'https://dash.recrubo.net'}/?payment=success`,
    },
  });
}

async function handleCancel(request, env) {
  // キャンセルページへリダイレクト（フロントエンドで処理）
  return new Response(null, {
    status: 302,
    headers: {
      'Location': `${env.DASHBOARD_URL || 'https://dash.recrubo.net'}/?payment=cancel`,
    },
  });
}
