#!/usr/bin/env node

/**
 * Canvas 画像ロード デバッグスクリプト
 * R2 アセットキーから画像をロードして、どこで失敗するかを確認
 */

const { createCanvas, loadImage } = require('canvas');

async function testImageLoad() {
  console.log("=== Canvas 画像ロードテスト ===\n");

  // テストケース
  const urls = [
    {
      name: "Invalid URL",
      url: null,
      expected: "FAIL"
    },
    {
      name: "Malformed URL",
      url: "not-a-url",
      expected: "FAIL"
    },
    {
      name: "Asset API URL",
      url: "https://api.recrubo.net/api/plus/assets/plus-templates/123456/1700000000000-test.png",
      expected: "FAIL (R2にデモ画像がないため)"
    },
    {
      name: "Public image",
      url: "https://via.placeholder.com/1280x720/ff0000/ffffff?text=Test",
      expected: "SUCCESS"
    }
  ];

  for (const testCase of urls) {
    console.log(`\n📌 テスト: ${testCase.name}`);
    console.log(`   URL: ${testCase.url || "(null)"}`);

    if (!testCase.url) {
      console.log("   ❌ URL がnil");
      continue;
    }

    try {
      console.log("   ⏳ ロード中...");
      const img = await loadImage(testCase.url);
      console.log(`   ✅ 成功: ${img.width}x${img.height}`);

      // キャンバスに描画テスト
      try {
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        console.log("   ✅ キャンバス描画OK");
      } catch (e) {
        console.log(`   ❌ キャンバス描画失敗: ${e.message}`);
      }
    } catch (e) {
      console.log(`   ❌ 失敗: ${e.message}`);
    }
  }

  console.log("\n=== 診断完了 ===\n");
  console.log("次のステップ:");
  console.log("1. Backend API が正常に応答しているか確認");
  console.log("   curl -v 'https://api.recrubo.net/api/plus/assets/plus-templates/...'");
  console.log("");
  console.log("2. Content-Type が image/* か確認");
  console.log("   curl -I 'https://api.recrubo.net/api/plus/assets/plus-templates/...'");
  console.log("");
  console.log("3. R2 バケットが正しく設定されているか確認");
  console.log("   wrangler r2 object list recrubo-plus-templates");
}

testImageLoad().catch(console.error);
