// Stripe 決済ルート
import { jsonResponse } from '../worker/http.js';

export async function handleStripeRoutes(request, url, env) {
  const pathname = url.pathname;

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

    // Stripe シークレットキーの確認
    if (!env.STRIPE_SECRET_KEY) {
      console.error('STRIPE_SECRET_KEY is not set');
      return jsonResponse({ error: 'Stripe configuration error' }, 500);
    }

    // Stripe SDK の動的インポート (Cloudflare Workers 用)
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-10-28.acacia',
    });

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
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    
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

async function handleSubscriptionUpdated(subscription, env) {
  console.log('Subscription updated:', subscription.id);
  
  // サブスクリプション情報を更新
  // TODO: データベースを更新
}

async function handleSubscriptionDeleted(subscription, env) {
  console.log('Subscription deleted:', subscription.id);
  
  // サブスクリプションを無効化
  // TODO: データベースを更新
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    
    await supabase.from('subscriptions')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('stripe_subscription_id', subscription.id);
  }
}

async function getUserFromRequest(request, env) {
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
