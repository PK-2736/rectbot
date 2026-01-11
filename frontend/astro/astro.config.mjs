import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// Cloudflare Pages で Functions を使う形に変更したい場合は @astrojs/cloudflare を導入する。
// ここでは一旦 static を維持し、/invite は別ホスト(backend)へ直接向ける方式に切替可能。
export default defineConfig({
   site: 'https://recrubo.net',
  integrations: [tailwind()],
  // output: 'hybrid' // ← adapter 未導入のため戻す
});