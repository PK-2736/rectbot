# 🔐 JWT / Service Token 設計ルール（Copilot向け）

## 結論

**Cloudflare Workers は JWT を「検証のみ」行う。
JWT の発行（署名）は OCI のみが行う。**

---

## 🚫 禁止事項（絶対にやってはいけない）

* Cloudflare Workers に **Service Secret / JWT Secret / Private Key を置かない**
* Workers で `jwt.sign()` / `signJwt()` / 署名処理を書くこと
* `SERVICE_JWT_SECRET ?? JWT_SECRET` のような fallback 実装
* Workers で JWT を発行できる設計・実装

---

## ✅ 正しい責務分離

### OCI（Bot / Auth）

* Service Secret / Private Key を保持
* JWT を発行する
* JWT 有効期限は **1〜5分**
* `aud` / `scope` / `iss` を必ず設定

### Cloudflare Workers（API）

* **公開鍵のみ**を保持
* JWT の検証のみを行う
* `aud` / `scope` / `exp` を必ず検証
* JWT を発行しない

---

## 🔑 環境変数ルール

### OCI にのみ存在してよい

* `SERVICE_JWT_SECRET`
* `JWT_PRIVATE_KEY`

### Workers にのみ存在してよい

* `SERVICE_JWT_PUBLIC_KEY`

❌ Workers に Secret が存在する実装は禁止

---

## 🧠 判断基準（迷ったらこれ）

* **JWT を新しく作っているか？**
  → YES = OCI
  → NO（検証のみ） = Worker

* **秘密鍵が必要か？**
  → YES = OCI
  → NO（公開鍵のみ） = Worker

---

## 🧩 実装ガイド

* JWT 発行関数と検証関数は **別ファイル・別モジュール**
* Worker では `verifyServiceJwtToken()` のみ使用
* 署名処理を import しない

---

## 🔐 セキュリティ目的

* Edge（Workers）から秘密情報を排除する
* JWT漏洩時の被害を最小化する
* 商用運用に耐える設計を維持する

---

## 📌 補足

* Worker が Service Secret を持っている時点で「検証専用」ではない
* 503/401 を避けるために Secret を渡すのは設計ミス
