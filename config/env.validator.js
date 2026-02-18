/**
 * 環境変数バリデーター
 * 各コンポーネントで必要な環境変数をチェック
 */

const requiredEnvVars = {
  bot: [
    'DISCORD_BOT_TOKEN',
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'BACKEND_API_URL',
    'INTERNAL_SECRET',
    'JWT_PRIVATE_KEY',
    'SERVICE_JWT_PRIVATE_KEY'
  ],
  backend: [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'JWT_PUBLIC_KEY',
    'JWT_ISSUER_URL',
    'SERVICE_JWT_PUBLIC_KEY',
    'INTERNAL_SECRET',
    'CLOUDFLARE_ACCOUNT_ID'
  ],
  frontend: [
    'NEXT_PUBLIC_API_BASE_URL',
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'DISCORD_REDIRECT_URI'
  ]
};

const optionalEnvVars = {
  bot: [
    'SENTRY_DSN',
    'DISCORD_WEBHOOK_URL',
    'REDIS_HOST',
    'REDIS_PORT',
    'REDIS_PASSWORD',
    'REDIS_DB',
    'IMAGE_QUEUE_NAME',
    'IMAGE_QUEUE_TIMEOUT_MS',
    'IMAGE_QUEUE_STRICT',
    'IMAGE_QUEUE_DISABLED'
  ],
  backend: ['SENTRY_DSN', 'R2_BUCKET_NAME', 'STRIPE_SECRET_KEY'],
  frontend: ['PUBLIC_RECAPTCHA_SITE_KEY', 'SENTRY_DSN']
};

function validateEnv(component, strict = true) {
  const required = requiredEnvVars[component] || [];
  const optional = optionalEnvVars[component] || [];
  
  const missing = required.filter(key => !process.env[key]);
  const missingOptional = optional.filter(key => !process.env[key]);
  
  const result = {
    component,
    valid: missing.length === 0,
    missing,
    missingOptional,
    present: required.filter(key => process.env[key])
  };
  
  if (!result.valid) {
    const errorMessage = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ Environment Variable Validation Failed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Component: ${component}
Missing required variables:
${missing.map(v => `  - ${v}`).join('\n')}

${missingOptional.length > 0 ? `
⚠️  Missing optional variables:
${missingOptional.map(v => `  - ${v}`).join('\n')}
` : ''}

Please check your .env file or GitHub Secrets.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `.trim();
    
    if (strict) {
      throw new Error(errorMessage);
    } else {
      console.warn(errorMessage);
    }
  } else {
    console.log(`✅ Environment variables validated for: ${component}`);
    if (missingOptional.length > 0) {
      console.warn(`⚠️  Optional variables missing: ${missingOptional.join(', ')}`);
    }
  }
  
  return result;
}

function validateAllEnv() {
  const results = {};
  
  ['bot', 'backend', 'frontend'].forEach(component => {
    try {
      results[component] = validateEnv(component, false);
    } catch (error) {
      results[component] = { valid: false, error: error.message };
    }
  });
  
  return results;
}

module.exports = {
  validateEnv,
  validateAllEnv,
  requiredEnvVars,
  optionalEnvVars
};
