import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

/**
 * Sentry初期化（Express Backend用）
 * 環境変数 SENTRY_DSN が必要
 */
export function initSentry() {
  if (!process.env.SENTRY_DSN) {
    console.warn("⚠️ SENTRY_DSN が設定されていません。Sentry監視は無効です。");
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "production",
    
    // パフォーマンス監視
    integrations: [
      nodeProfilingIntegration(),
    ],
    
    // トレースサンプリング（100%）
    tracesSampleRate: 1.0,
    
    // プロファイリングサンプリング
    profilesSampleRate: 1.0,
    
    // タグ設定（Backend識別用）
    initialScope: {
      tags: {
        service: "express-backend",
        app_name: "rectbot-api",
      },
    },
  });

  console.log("✅ Sentry初期化完了（Express Backend）");
}

/**
 * Expressミドルウェアを取得
 * @returns {Object} { requestHandler, tracingHandler, errorHandler }
 */
export function getSentryMiddleware() {
  return {
    requestHandler: Sentry.Handlers.requestHandler(),
    tracingHandler: Sentry.Handlers.tracingHandler(),
    errorHandler: Sentry.Handlers.errorHandler(),
  };
}

/**
 * エラーをSentryに送信
 * @param {Error} error エラーオブジェクト
 * @param {Object} context 追加コンテキスト
 */
export function captureException(error, context = {}) {
  Sentry.captureException(error, {
    contexts: {
      backend: context,
    },
  });
}

export default Sentry;
