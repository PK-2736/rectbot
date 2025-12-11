了解です。
あなたの要件に合わせて **Cloudflare Workers / D1 / KV / Workers AI / discord.js v14** を前提にした
**最適構成の README.md** を作ります。

そのまま GitHub に貼って使えるレベルでまとめます。

---

# ✅ **README.md（完成版）**

```md
# 🎮 Discord Party Linker Bot
ゲームごとのフレンドコードを保存・表示し、  
パーティー募集をスムーズにするための Discord Bot です。

Cloudflare Workers・Workers AI・D1・KV を使用して  
高速で低コストの運用が可能です。

---

# 🚀 機能概要

## 🔗 フレンドコード保存機能
Discord 内でパーティーを組む際、
**自分のフレンドコードを毎回探しに行かなくても Bot が保存しておいてくれる機能**。

### 主な操作
| コマンド | 内容 |
|---------|------|
| `/link-add` | モーダルが開き、ゲーム名とフレンドコードを入力すると保存 |
| `/link-show` | 自分の登録しているフレンドコード一覧を表示 |
| `@Bot <ゲーム名> @ユーザー` | 指定ゲームのフレンドコードを取得 |
| `/link-delete <ゲーム名>` | 指定ゲームのフレンドコードを削除 |

---

# 🧠 フレンドコード登録の処理フロー

1. `/link-add` を実行
2. モーダルで「ゲーム名」「フレンドコード」を入力
3. Workers へ送信
4. **Workers AI がゲーム名を自然言語解析し、標準化されたゲーム名に正規化**
   - 例:  
     - 「valo」「Valo」「ばろらんと」→ **Valorant**  
     - 「apex」「Apex Legends」→ **Apex Legends**
5. KV に保存されているゲーム名リスト･正規表現･類似データから補正
6. 最終的な正式ゲーム名で D1 に保存
7. `/link-show` や `@Bot ゲーム名 @user` で参照

---

# 🗂️ ディレクトリ構成

```

project-root/
├── worker/
│   ├── index.js              # Cloudflare Worker エントリーポイント
│   ├── routes/
│   │   ├── linkAdd.js        # /link-add 実行 → 保存処理
│   │   ├── linkShow.js       # /link-show
│   │   ├── linkDelete.js     # /link-delete
│   │   └── resolveGame.js    # AIでゲーム名判定
│   ├── db/
│   │   └── schema.sql        # D1 スキーマ
│   └── utils/
│       ├── ai.js             # Workers AI 呼び出し
│       ├── kv.js             # KV からゲーム名辞書取得
│       └── response.js       # 共通レスポンス
│
├── discord/
│   ├── bot.js                # Discord botメイン（discord.js v14）
│   ├── commands/
│   │   ├── link-add.js
│   │   ├── link-show.js
│   │   └── link-delete.js
│   └── interactions/
│       ├── modalSubmit.js
│       └── components.js
│
├── kv/
│   └── games.json            # ゲーム名辞書（手動入力 or AI生成）
│
├── wrangler.toml             # Cloudflare設定
├── package.json
└── README.md

````

---

# 🗄️ D1 データベース構造

```sql
CREATE TABLE friend_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  game_name TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, game_name)
);
````

---

# 🔧 KV（ゲーム名辞書例）

`kv/games.json`

```json
{
  "valorant": ["valo", "val", "ばろらんと", "ヴァロ"],
  "apex legends": ["apex", "えぺ", "apexlegends"],
  "fortnite": ["fn", "fort", "フォトナ"],
  "minecraft": ["mc", "マイクラ"]
}
```

Workers AI で曖昧検索→正式ゲーム名へ正規化します。

---

# 🤖 Workers AI のゲーム名判定（擬似コード）

```js
export async function normalizeGameName(input, env) {
  const kvData = await env.GAMES.get("games", { type: "json" });

  // 1. 完全一致 / 部分一致
  for (const key in kvData) {
    if (key === input.toLowerCase()) return key;
    if (kvData[key].some(alias => input.toLowerCase().includes(alias))) return key;
  }

  // 2. Workers AI で類似ゲーム候補を生成
  const aiRes = await env.AI.run("@cf/meta/embedding", { text: input });

  // 3. Vectorize で類似ゲーム名を検索（任意）
  // or 大まかなLLM推論で正式名を返す
}
```

---

# 🧩 Discord コマンド動作例

## `/link-add`

1. モーダル表示
2. 入力された

   * ゲーム名
   * フレンドコード
3. Worker → AI → KV で標準名へ正規化
4. D1 に保存
5. 「保存しました」を返信

---

## `/link-show`

Bot が D1 からユーザーのコード一覧を返す:

```
🎮 登録されているフレンドコード:

・Valorant： Yumeno#1234
・Apex Legends： YumeApex#9981
```

---

## `/link-delete`

```
/link-delete valorant
```

→ 「Valorant のフレンドコードを削除しました」

---

# 🚀 セットアップ

## 1. 依存関係インストール

```
npm install discord.js wrangler
```

---

## 2. Cloudflare 環境設定

`wrangler.toml`

```toml
name = "friend-linker"
main = "worker/index.js"
compatibility_date = "2024-01-20"

[[d1_databases]]
binding = "DB"
database_name = "friendcodes"
database_id = "xxxx"

[[kv_namespaces]]
binding = "GAMES"
id = "xxxx"

[ai]
binding = "AI"
```

---

## 3. KV にゲーム辞書をアップロード

```
wrangler kv:key put --binding=GAMES games "$(cat kv/games.json)"
```

---

## 4. D1 初期化

```
wrangler d1 execute friendcodes --file=worker/db/schema.sql
```

---

