// Stripe 決済ルート
import { jsonResponse } from '../worker/http.js';
import { verifyInternalAuth } from '../worker/auth.js';

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

async function createSupabaseClient(env) {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseServiceKey = resolveSupabaseServiceKey(env);
  if (!supabaseUrl || !supabaseServiceKey) return null;

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
    if (!priceId) {
      return jsonResponse({ error: 'priceId is required (or set STRIPE_PREMIUM_PRICE_ID)' }, 400);
    }

    const stripe = await createStripeClient(env);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${dashboardUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${dashboardUrl}/cancel`,
      client_reference_id: userId,
      allow_promotion_codes: true,
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

  const { data, error } = await supabase
    .from('subscriptions')
    .select('user_id, stripe_subscription_id, stripe_customer_id, status, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[stripe] Failed to fetch subscription status:', error);
    return null;
  }

  return data || null;
}

function isPremiumStatus(status) {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'active' || normalized === 'trialing';
}

async function getSubscriptionStatusForBot(request, url, env) {
  try {
    if (!await verifyInternalAuth(request, env)) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const userId = String(url.searchParams.get('userId') || '').trim();
    if (!userId) {
      return jsonResponse({ error: 'userId is required' }, 400);
    }

    const subscription = await fetchLatestSubscriptionByUserId(userId, env);
    if (!subscription) {
      return jsonResponse({
        hasSubscription: false,
        isPremium: false,
        status: 'none'
      });
    }

    return jsonResponse({
      hasSubscription: true,
      isPremium: isPremiumStatus(subscription.status),
      status: subscription.status,
      subscription: subscription
    });
  } catch (error) {
    console.error('Error getting subscription status for bot:', error);
    return jsonResponse({ error: 'Failed to get subscription status' }, 500);
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
    // 認証チェック（Cookie から JWT を検証）
    const user = await getUserFromRequest(request, env);
    if (!user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = await request.json();
    const { priceId } = body;

    if (!priceId) {
      return jsonResponse({ error: 'priceId is required' }, 400);
    }

    const stripe = await createStripeClient(env);

    // Checkout セッションを作成
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${env.DASHBOARD_URL || 'https://dash.recrubo.net'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.DASHBOARD_URL || 'https://dash.recrubo.net'}/cancel`,
      client_reference_id: user.id,
      customer_email: user.email,
      metadata: {
        userId: user.id,
        username: user.username,
      },
    });

    return jsonResponse({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
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
        await handleCheckoutSessionCompleted(event.data.object, env);
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
    return jsonResponse({ error: 'Webhook processing failed' }, 400);
  }
}

async function handleCheckoutSessionCompleted(session, env) {
  console.log('Checkout session completed:', session.id);
  
  // サブスクリプション情報をデータベースに保存
  // TODO: Supabase または Durable Object を使用してサブスクリプション情報を保存
  const userId = session.client_reference_id || session.metadata?.userId;
  const subscriptionId = session.subscription;
  
  console.log(`User ${userId} subscribed with subscription ${subscriptionId}`);
  
  // 例: Supabase に保存
  const supabase = await createSupabaseClient(env);
  if (supabase) {
    
    await supabase.from('subscriptions').upsert({
      user_id: userId,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: session.customer,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
}

async function handleSubscriptionUpdated(subscription, _env) {
  console.log('Subscription updated:', subscription.id);
  
  // サブスクリプション情報を更新
  // TODO: データベースを更新
}

async function handleSubscriptionDeleted(subscription, env) {
  console.log('Subscription deleted:', subscription.id);
  
  // サブスクリプションを無効化
  // TODO: データベースを更新
  const supabase = await createSupabaseClient(env);
  if (supabase) {
    
    await supabase.from('subscriptions')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('stripe_subscription_id', subscription.id);
  }
}

async function getUserFromRequest(request, _env) {
  try {
    // Cookie から JWT を取得
    const cookies = request.headers.get('Cookie') || '';
    const authToken = cookies.split(';')
      .find(c => c.trim().startsWith('auth_token='))
      ?.split('=')[1];

    if (!authToken) {
      return null;
    }

    // JWT を検証（簡易実装 - 本番では適切な検証を実装）
    // TODO: JWT ライブラリを使用して検証
    const payload = JSON.parse(atob(authToken.split('.')[1]));
    return {
      id: payload.sub || payload.id,
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
