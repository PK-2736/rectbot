/**
 * Backend Worker用エラーハンドラー
 */

class ApiErrorHandler {
  /**
   * 標準エラーレスポンスを生成
   */
  static errorResponse(message, status = 500, details = null) {
    return new Response(
      JSON.stringify({
        success: false,
        error: message,
        code: status,
        details,
        timestamp: new Date().toISOString()
      }),
      {
        status,
        headers: {
          'Content-Type': 'application/json',
          'X-Error-Code': String(status)
        }
      }
    );
  }
  
  /**
   * エラーをログに記録してレスポンスを返す
   */
  static async handle(error, request, env) {
    console.error('API Error:', {
      message: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
      timestamp: new Date().toISOString()
    });
    
    // Sentry送信（環境変数があれば）
    if (env.SENTRY_DSN) {
      // Worker用のSentry送信処理
    }
    
    // エラータイプに応じたレスポンス
    if (error.name === 'ValidationError') {
      return this.errorResponse(error.message, 400, error.details);
    }
    
    if (error.name === 'AuthenticationError') {
      return this.errorResponse('Authentication failed', 401);
    }
    
    if (error.name === 'NotFoundError') {
      return this.errorResponse('Resource not found', 404);
    }
    
    // デフォルトエラー
    return this.errorResponse(
      'Internal server error',
      500,
      process.env.NODE_ENV === 'development' ? error.stack : null
    );
  }
  
  /**
   * 成功レスポンスを生成
   */
  static successResponse(data, message = 'Success', status = 200) {
    return new Response(
      JSON.stringify({
        success: true,
        message,
        data,
        timestamp: new Date().toISOString()
      }),
      {
        status,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}

module.exports = ApiErrorHandler;
