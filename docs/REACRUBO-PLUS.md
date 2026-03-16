以下は、**実装レベルまで踏み込んだ README / 技術設計ドキュメント**の例です。
（そのまま `README.md` として使える構成にしています）

---

```markdown
# Recrubo

Recrubo は Discord サーバー向けの **募集画像生成 SaaS / Discord Bot** です。  
Web 上でテンプレートをカスタマイズし、募集内容を画像に埋め込んで Discord に投稿できます。

---

# Architecture

```

Web Editor
│
│ REST API
▼
Backend API
│
├ DB
│   └ Supabase
│
├ Image Storage
│   └ Cloudflare R2
│
▼
Image Generator
│
▼
Discord Bot

```

使用サービス

- DB → :contentReference[oaicite:0]{index=0}
- 画像保存 → :contentReference[oaicite:1]{index=1}
- Bot → :contentReference[oaicite:2]{index=2}

---

# Features

## Core

- 募集作成
- 募集画像生成
- Discord投稿
- 募集履歴

## Recrubo Plus

- 募集数制限解除
- 募集期限延長
- 募集テンプレカスタマイズ
- Web画像エディタ

---

# Project Structure

```

recrubo
│
├ frontend
│   ├ components
│   │   ├ EditorCanvas.tsx
│   │   ├ ElementPanel.tsx
│   │   ├ DiscordPreview.tsx
│   │
│   ├ pages
│   │   ├ editor.tsx
│   │   ├ recruit.tsx
│   │
│   └ utils
│       └ layoutSerializer.ts
│
├ backend
│   ├ routes
│   │   ├ templates.ts
│   │   ├ recruits.ts
│   │
│   ├ services
│   │   ├ imageGenerator.ts
│   │   ├ discordPoster.ts
│   │
│   └ db
│       └ supabase.ts
│
├ bot
│   ├ commands
│   │   └ recruit.ts
│   └ bot.ts
│
└ shared
└ types.ts

```

---

# Database Schema

## templates

```

id UUID PRIMARY KEY
guild_id TEXT
name TEXT
template_image_url TEXT
layout JSONB
created_at TIMESTAMP

```

---

## recruits

```

id UUID
guild_id TEXT
template_id UUID
title TEXT
description TEXT
time TEXT
members INTEGER
created_at TIMESTAMP

```

---

## subscriptions

```

guild_id TEXT
plan TEXT
status TEXT
expires_at TIMESTAMP

````

---

# Layout JSON Format

テンプレートのレイアウトは JSON で保存する。

```json
{
 "elements":[
  {
   "id":"title",
   "type":"text",
   "field":"title",
   "x":200,
   "y":120,
   "width":600,
   "fontSize":40,
   "color":"#ffffff"
  },
  {
   "id":"description",
   "type":"text",
   "field":"description",
   "x":200,
   "y":260,
   "width":600,
   "fontSize":28
  },
  {
   "id":"time",
   "type":"text",
   "field":"time",
   "x":800,
   "y":520,
   "fontSize":24
  },
  {
   "id":"members",
   "type":"text",
   "field":"members",
   "x":650,
   "y":520,
   "fontSize":24
  },
  {
   "id":"thumbnail",
   "type":"image",
   "field":"thumbnail",
   "x":100,
   "y":420,
   "width":200,
   "height":200
  }
 ]
}
````

---

# Template Editor

Web上で **ドラッグ&ドロップ編集**を行う。

推奨ライブラリ

* react-konva
* fabric.js

---

## Editor Canvas

```
┌────────────────────┐
│ 背景テンプレート画像 │
│                    │
│ [title]            │
│                    │
│ [description]      │
│                    │
│ [time] [members]   │
│                    │
│ [image]            │
└────────────────────┘
```

---

## Element Types

| type  | 説明     |
| ----- | ------ |
| text  | テキスト   |
| image | 画像     |
| icon  | アイコン   |
| box   | 背景ボックス |

---

# Editor State

```
EditorState

templateImage
elements[]
selectedElement
```

---

# API

## Create Template

```
POST /templates
```

```
{
 "guild_id": "...",
 "layout": {...}
}
```

---

## Get Template

```
GET /templates/{guild_id}
```

---

## Create Recruit

```
POST /recruits
```

```
{
 "guild_id":"...",
 "template_id":"...",
 "title":"大会募集",
 "description":"初心者歓迎",
 "time":"21:00",
 "members":4
}
```

---

# Image Generation

画像生成はテンプレート + layout JSON を元に描画する。

処理

```
load template image
↓
read layout JSON
↓
loop elements
↓
draw text/image
↓
export image
```

Node実装例

```
ctx.fillText(title, x, y)
```

---

# Discord Post

Botが画像を送信

```
channel.send({
 files: [{
  attachment: buffer,
  name: "recruit.png"
 }]
})
```

---

# Performance

画像生成時間目標

```
< 200ms
```

高速化

* 画像保存を省略
* CDNテンプレ使用
* JSONレイアウト

---

# Security

制限

* guild単位アクセス制御
* Supabase RLS
* 不正画像対策

---

# Future

* テンプレマーケット
* 募集統計
* AIテンプレ生成
* スケジュール投稿

---

# License

TBD

```

---

もし希望あれば、次に **このプロジェクトで一番重要な部分**である  

**「Webテンプレートエディタ（Canva型UI）」の実装設計**を  

- Reactコンポーネント構造  
- 状態管理  
- ドラッグ処理  
- JSON生成  

```

