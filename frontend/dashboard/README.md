# rectbot Dashboard

Discord Botの管理画面アプリケーション

## 環境変数設定

以下の環境変数を設定してください：

```bash
# Discord OAuth2 設定
NEXT_PUBLIC_DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
NEXT_PUBLIC_DISCORD_REDIRECT_URI=https://dash.rectbot.tech/auth/callback

# Backend API
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3000

# 管理者ID（カンマ区切り）
ADMIN_IDS=user_id_1,user_id_2,user_id_3
```

## 開発環境での実行

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) でアプリケーションが起動します。

## ビルド

```bash
npm run build
```

静的サイトとして `out/` ディレクトリに出力されます。

## デプロイ

Cloudflare Pagesにデプロイされます。カスタムドメイン `dash.rectbot.tech` で利用可能です。

### Discord アプリケーション設定

Discord Developer Portalで以下のリダイレクトURLを設定してください：
- 開発環境: `http://localhost:3000/auth/callback`
- 本番環境: `https://dash.rectbot.tech/auth/callback`

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
