# 🚨 Discord OAuth エラー緊急対応ガイド

## 現在のエラー
```
Failed to get Discord access token: invalid_grant - Invalid "code" in request.
```

このエラーは **Discord Developer Portal に正しいリダイレクトURIが登録されていない** ことが原因です。

---

## 🔴 最優先: Discord Developer Portal を今すぐ確認

### Step 1: Discord Developer Portal にアクセス

以下のURLにアクセスしてください:
```
https://discord.com/developers/applications/1048950201974542477/oauth2
```

### Step 2: "Redirects" セクションを確認

画面の中央あたりに **"Redirects"** というセクションがあります。

#### ✅ 正しい設定:
```
https://api.rectbot.tech/api/discord/callback
```
☝️ この **1つだけ** が登録されていればOKです。

#### ❌ よくある間違い:

以下のようなURIが登録されていたら **すべて削除** してください:

```
❌ https://dash.rectbot.tech/api/discord/callback  (dash ではなく api)
❌ http://api.rectbot.tech/api/discord/callback   (http ではなく https)
❌ https://api.rectbot.tech/api/discord/callback/ (末尾のスラッシュ)
❌ https://api.rectbot.tech/callback              (パスが違う)
❌ localhost のURL                                  (開発用、本番では不要)
```

### Step 3: 設定を修正

1. **既存の間違ったURIを削除**:
   - 各URIの右側にある 🗑️ (ゴミ箱) アイコンをクリック

2. **正しいURIを追加**:
   - "Add Another" ボタンをクリック
   - 以下をコピー&ペースト (手入力しない):
   ```
   https://api.rectbot.tech/api/discord/callback
   ```
   
3. **保存**:
   - 画面下部の **"Save Changes"** ボタンをクリック

4. **5分待つ**:
   - Discord の設定が反映されるまで数分かかります

---

## 📋 確認チェックリスト

以下をすべて確認してください:

### ✅ Discord Developer Portal
- [ ] Redirects セクションに `https://api.rectbot.tech/api/discord/callback` が登録されている
- [ ] 他の間違ったURIは削除済み
- [ ] "Save Changes" をクリック済み
- [ ] 5分以上待った

### ✅ 環境変数（すでに確認済み）
- [x] backend/wrangler.toml: `DISCORD_REDIRECT_URI = "https://api.rectbot.tech/api/discord/callback"`
- [x] frontend/.env.production: `NEXT_PUBLIC_DISCORD_REDIRECT_URI=https://api.rectbot.tech/api/discord/callback`
- [x] GitHub Secrets: `DISCORD_REDIRECT_URI=https://api.rectbot.tech/api/discord/callback`

---

## 🧪 テスト手順

Discord Developer Portal の設定を修正したら、以下の手順で必ずテストしてください:

### 1. 新しいシークレットウィンドウを開く
- Chrome/Edge: Ctrl+Shift+N
- Firefox: Ctrl+Shift+P

**重要**: OAuth code は1回しか使えないため、毎回新しいウィンドウが必要です

### 2. ダッシュボードにアクセス
```
https://dash.rectbot.tech
```

### 3. 「Discordでログイン」をクリック

### 4. Discord認証画面で「認証」をクリック

### 5. エラーが出た場合

#### A. URLをコピー
ブラウザのアドレスバーに表示されているURLをすべてコピーして教えてください。
例:
```
https://api.rectbot.tech/api/discord/callback?code=XXXXX&error=...
```

#### B. エラーメッセージをコピー
画面に表示されているエラーメッセージをすべてコピーして教えてください。

#### C. ターミナルでログを確認
```bash
# Workerのログをチェック
cd /workspaces/rectbot/backend
npx wrangler tail --format pretty
```

別のターミナルで再度ログインを試すと、リアルタイムでログが表示されます。

---

## 🔍 Discord Developer Portal の見方

Discord Developer Portal にアクセスしたら、以下のように表示されます:

```
┌─────────────────────────────────────────────────────┐
│ OAuth2                                              │
├─────────────────────────────────────────────────────┤
│ Client ID                                           │
│ 1048950201974542477                    [Copy]       │
│                                                     │
│ Client Secret                                       │
│ ••••••••••••••••••••••••               [Reset]     │
│                                                     │
│ Redirects                              [Add Another]│
│ https://api.rectbot.tech/api/discord/callback  🗑️  │
│                                                     │
│                               [Save Changes]        │
└─────────────────────────────────────────────────────┘
```

**"Redirects"** セクションに上記のURIが1つだけ表示されていればOKです。

---

## 🐛 デバッグ情報の確認

以下のコマンドで、現在の設定をすべて確認できます:

```bash
cd /workspaces/rectbot

echo "=== 1. Backend Worker 設定 ==="
grep DISCORD_REDIRECT_URI backend/wrangler.toml

echo ""
echo "=== 2. Frontend Pages 設定 ==="
grep REDIRECT_URI frontend/dashboard/.env.production

echo ""
echo "=== 3. GitHub Actions ログ確認 ==="
echo "https://github.com/PK-2736/rectbot/actions にアクセスして"
echo "最新のデプロイログで DISCORD_REDIRECT_URI の値を確認してください"
```

---

## ❓ よくある質問

### Q1: "Invalid code" エラーが出続ける
**A**: Discord Developer Portal の Redirects が間違っている可能性が高いです。上記の手順で必ず確認してください。

### Q2: ページをリロードしたらエラーになった
**A**: OAuth code は1回しか使えません。毎回新しいシークレットウィンドウで認証してください。

### Q3: Discord Developer Portal に何も登録されていない
**A**: 以下を新規追加してください:
```
https://api.rectbot.tech/api/discord/callback
```

### Q4: localhost のURIが登録されている
**A**: 開発環境用です。本番環境では削除してもOKですが、残しても問題ありません。

### Q5: 複数のURIを登録してもいい?
**A**: はい、複数登録できます。ただし、以下のURIは必ず含めてください:
```
https://api.rectbot.tech/api/discord/callback
```

---

## 📞 次のステップ

1. **今すぐ Discord Developer Portal を確認** ← 最優先!
2. 現在登録されているリダイレクトURIをすべて教えてください
3. 修正後、新しいシークレットウィンドウでテスト
4. エラーが出たら、URLとエラーメッセージを教えてください

---

## 💡 ヒント

もし Discord Developer Portal にアクセスできない場合:
- Discord アカウントでログインしているか確認
- Application の Owner (所有者) であるか確認
- ブラウザのキャッシュをクリア

---

**この問題は 99% Discord Developer Portal の設定ミスです。必ず上記を確認してください!** 🙏
