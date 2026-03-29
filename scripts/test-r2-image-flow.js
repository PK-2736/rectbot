#!/usr/bin/env node

/**
 * テンプレート画像取得フロー検証スクリプト
 * - Cloudflare R2から画像URL構築
 * - Backend API経由でのアクセス テスト
 * - Bot環境での画像ロード可能性確認
 */

// Bot側の環境変数シミュレーション
const botEnv = {
  WORKER_API_BASE_URL: process.env.WORKER_API_BASE_URL,
  PUBLIC_API_BASE_URL: process.env.PUBLIC_API_BASE_URL,
  BACKEND_API_URL: process.env.BACKEND_API_URL || 'https://api.recrubo.net',
};

// Backend側のアセットキー構造
const mockTemplates = {
  template1: {
    name: "いい",
    background_asset_key: "plus-templates/123456/1700000000000-いい.png",
    background_image_url: null,
    layout_json: {
      canvas: { width: 1280, height: 720 },
      title: { x: 420, y: 36, size: 64 }
    }
  },
  template2: {
    name: "recruitment_event",
    background_asset_key: "plus-templates/123456/1700000001000-recruitment_event.png",
    background_image_url: null, // Asset keyが優先
  },
  template3: {
    name: "direct_url",
    background_image_url: "https://example.com/image.png",
    background_asset_key: null,
  }
};

console.log("=== テンプレート画像URL構築フロー検証 ===\n");

function getTemplateBackgroundUrl(recruitData) {
  const direct = recruitData?.background_image_url || null;

  if (direct && /^https?:\/\//i.test(String(direct))) {
    console.log("  ✓ 方式: 直接HTTPS URL");
    return direct;
  }

  const assetKey = recruitData?.background_asset_key || null;
  if (assetKey) {
    const base = botEnv.WORKER_API_BASE_URL
      || botEnv.PUBLIC_API_BASE_URL 
      || botEnv.BACKEND_API_URL
      || 'https://api.recrubo.net';
    const normalizedBase = String(base).replace(/\/$/, '');
    const normalizedKey = String(assetKey).replace(/^\//, '');
    const url = `${normalizedBase}/api/plus/assets/${normalizedKey}`;
    console.log("  ✓ 方式: Asset Key → API経由");
    console.log(`    Base: ${normalizedBase}`);
    console.log(`    Key: ${normalizedKey}`);
    return url;
  }

  console.log("  ✗ 方式: URL見つからず");
  return null;
}

function validateImageUrl(url) {
  if (!url) {
    console.log("  ✗ 検証失敗: URLがnull");
    return false;
  }

  try {
    new URL(url);
    console.log(`  ✓ URL形式OK: ${url}`);
    return true;
  } catch (e) {
    console.log(`  ✗ URL形式エラー: ${e.message}`);
    return false;
  }
}

async function testApiEndpoint(url) {
  if (!url) return false;
  
  try {
    console.log(`  🌐 APIテスト: HEAD ${url}`);
    const response = await fetch(url, { method: 'HEAD', timeout: 5000 });
    console.log(`  ✓ ステータス: ${response.status}`);
    
    const contentType = response.headers.get('content-type');
    if (contentType?.startsWith('image/')) {
      console.log(`  ✓ Content-Type: ${contentType}`);
      return true;
    } else {
      console.log(`  ⚠ Content-Type: ${contentType} (画像ではない可能性)`);
      return response.status < 400;
    }
  } catch (e) {
    console.log(`  ✗ API エラー: ${e.message}`);
    return false;
  }
}

async function main() {
  for (const [templateId, template] of Object.entries(mockTemplates)) {
    console.log(`\n📋 テンプレート: ${template.name}`);
    console.log(`   ID: ${templateId}`);
    
    const url = getTemplateBackgroundUrl(template);
    validateImageUrl(url);
    
    // Optional: uncomment to test real API
    // await testApiEndpoint(url);
  }

  console.log("\n=== 環境変数チェック ===");
  console.log(`BACKEND_API_URL: ${botEnv.BACKEND_API_URL}`);
  console.log(`WORKER_API_BASE_URL: ${botEnv.WORKER_API_BASE_URL || '(未設定)'}`);
  console.log(`PUBLIC_API_BASE_URL: ${botEnv.PUBLIC_API_BASE_URL || '(未設定)'}`);

  console.log("\n=== OCI環境での推奨設定 ===");
  console.log("export BACKEND_API_URL=https://api.recrubo.net");
  console.log("# または内部ネットワークの場合:");
  console.log("# export BACKEND_API_URL=http://internal-backend:3000");

  console.log("\n✅ フロー検証完了");
}

main().catch(console.error);
