# 🗑️ SmartTrashNotify - IoTスマートゴミ箱通知システム（バックエンド）

M5Stack Plus2と超音波距離センサー（HC-SR04）を用いてゴミの蓄積量を計測し、地域のゴミ回収日と組み合わせて最適なタイミングでLINE通知を行うIoTバックエンドシステムです。

大学での共同開発プロジェクトにおいて、バックエンドの設計・実装を担当しました。

---

# 📌 担当した内容

本プロジェクトでは主にバックエンド全体を担当しました。

* Node.js / ExpressによるREST API実装
* PostgreSQL（Supabase）のデータベース設計
* Renderへのデプロイ
* LINE Messaging APIによる通知機能
* API設計
* JST（日本時間）を考慮した日付判定ロジック
* PostgreSQLの制約を利用した重複通知防止（Idempotency）の実装

---

# 🏗️ システム構成

```text
M5Stack Plus2 + HC-SR04
        │
        │ HTTP POST
        ▼
Render (Node.js / Express)
        │
        ├── PostgreSQL (Supabase)
        │       │
        │       └── UNIQUE(target_date)
        │           ON CONFLICT DO NOTHING
        │
        └── LINE Messaging API
                 │
                 ▼
            LINE通知
```

---

# 📖 システム概要

ゴミ箱の蓋裏に取り付けた超音波距離センサー（HC-SR04）が、ゴミ表面までの距離を定期的に計測します。

ゴミが満杯になると、M5StackからバックエンドAPIへHTTP POSTリクエストを送信します。

バックエンドでは以下の処理を実行します。

1. 次回のゴミ回収日を判定
2. PostgreSQLへ通知情報を登録
3. 同一回収日に対する通知が既に存在する場合は重複登録を防止
4. LINE Messaging APIを利用して通知を送信

---

# ✨ 技術的な工夫

## 1. データベース制約による冪等性（Idempotency）の担保

M5Stackはゴミが満杯である間、一定時間ごとにAPIを送信します。

このまま処理すると、同じ内容のLINE通知が何度も送信されてしまいます。

本システムではアプリケーション側で複雑な排他制御を実装する代わりに、

```sql
UNIQUE(target_date)
```

および

```sql
ON CONFLICT DO NOTHING
```

を利用し、データベースレベルで重複通知を防止しています。

この設計により、

* 同一回収日の通知は一度だけ送信
* シンプルな実装
* データベースによる整合性保証

を実現しています。

---

## 2. UTC環境を考慮したJST日付判定

RenderではサーバーがUTCで動作します。

そのため、単純に

```javascript
new Date()
```

を利用すると、日本時間との時差により通知日がずれる可能性があります。

そこでUTCからJST（UTC+9）へ補正した日時を基準に、次回ゴミ回収日を判定するロジックを実装しました。

これにより、サーバーの実行環境に依存しない正確な日付判定を実現しています。

---

## 3. 組み込み機器を考慮したAPI設計

M5Stack側の実装負荷を軽減するため、

```
POST /api/trash-full
```

へBodyなしでPOSTするだけのシンプルなAPIを設計しました。

これにより、

* 組み込み側のコード量削減
* メモリ使用量削減
* ハードウェア担当との連携容易化

を実現しています。

---

# 🛠️ 技術スタック

| 分類           | 技術                    |
| ------------ | --------------------- |
| Backend      | Node.js / Express     |
| Database     | PostgreSQL (Supabase) |
| Hosting      | Render                |
| IoT Device   | M5Stack Plus2         |
| Sensor       | HC-SR04 超音波距離センサー     |
| Notification | LINE Messaging API    |

---

# 📂 ディレクトリ構成

```text
root/
├── .env
├── package.json
├── db.js          # PostgreSQL接続設定
├── server.js      # APIサーバー・日付判定・通知処理
└── worker.js      # 通知処理モジュール
```

---

# 🔌 API

## POST `/api/trash-full`

M5Stackからゴミ箱満杯通知を受信します。

### Request

```http
POST /api/trash-full
Content-Type: application/json

{}
```

### Response（通知成功）

```json
{
  "success": true,
  "status": "sent",
  "date": "2026-07-03"
}
```

### Response（既に通知済み）

```json
{
  "success": true,
  "message": "Already processed today"
}
```

---

# 🚀 ローカルでの実行

## Clone

```bash
git clone https://github.com/wefdsxcv/gomibako_server_app.git
cd gomibako_server_app
```

## Install

```bash
npm install
```

## .env

```env
PORT=3000

DATABASE_URL=

LINE_CHANNEL_ACCESS_TOKEN=

LINE_USER_ID=
```

## Run

```bash
node server.js
```

---

# 🔮 今後の改善

* Docker対応
* TypeScript化
* GitHub ActionsによるCI
* OpenAPI（Swagger）の導入
* Jestによる自動テスト
* ログ管理の改善
* 認証機能の追加

---

# 🧰 使用技術

* Node.js
* Express
* PostgreSQL
* Supabase
* Render
* LINE Messaging API
* REST API
