IoTスマートゴミ箱通知システムのバックエンド（Node.js / Express）

M5Stackで取得したゴミの蓄積量と地域のゴミ回収日を組み合わせ、
最適なタイミングでLINEへ通知するIoTバックエンドです。

大学の共同開発において、

バックエンド設計
API設計
データベース設計
インフラ構築
LINE/Firebase連携

を担当しました。

システム構成
M5Stack
   │
   │ HTTP POST
   ▼
Render (Node.js / Express)
   │
   ├── PostgreSQL (Supabase)
   │
   ├── Firebase
   │
   └── LINE Messaging API
   │
   ▼
ユーザーへ通知
システム概要

ゴミ箱の蓋裏に設置した超音波距離センサーがゴミの蓄積量を監視します。

満杯になるとM5StackからAPIへPOSTリクエストを送信します。

バックエンドでは

次回ゴミ回収日を判定
重複通知を防止
Firebase / LINEへ通知

を実行します。

担当した内容

このプロジェクトでは主にバックエンド全体を担当しました。

Node.js / Express API実装
PostgreSQL設計
Renderデプロイ
LINE Messaging API連携
Firebase連携
API設計
通知ロジック
JST日付判定ロジック
二重通知防止（Idempotency）
技術的な工夫
1. UNIQUE制約による冪等性

M5Stackは満杯状態の間、
一定時間ごとにAPIを呼び続けます。

アプリケーション側で複雑な排他制御を実装する代わりに、

UNIQUE(target_date)

および

ON CONFLICT DO NOTHING

を利用することで、

同じ回収日の通知は一度だけ
シンプルなコード
DBレベルで整合性保証

を実現しました。

2. JSTでの日付計算

RenderはUTCで動作します。

そのまま

new Date()

を利用すると

通知日が1日ずれる

という問題があります。

そこで、

UTC
↓

JST(+9)

↓

次回ゴミ回収日計算

というロジックを実装しています。

3. M5Stack向けAPI設計

組み込み側の実装を簡潔にするため、

POST /api/trash-full

Bodyなし

という非常にシンプルなAPI設計にしました。

これにより

C++側実装が容易
メモリ使用量削減
保守性向上

を実現しています。

技術スタック
分類	技術
Backend	Node.js / Express
Database	PostgreSQL (Supabase)
Hosting	Render
IoT	M5Stack Plus2
Sensor	HC-SR04 超音波距離センサー
Notification	LINE Messaging API
Cloud	Firebase
ディレクトリ構成
.
├── server.js        # APIサーバー
├── db.js            # PostgreSQL接続
├── worker.js        # 通知処理
├── package.json
└── .env
API
POST /api/trash-full

M5Stackから満杯通知を受け取ります。

Request

POST /api/trash-full
Content-Type: application/json

{}

成功

{
  "success": true,
  "status": "sent",
  "date": "2026-07-03"
}

既に通知済み

{
  "success": true,
  "message": "Already processed today"
}
セットアップ
git clone https://github.com/wefdsxcv/gomibako_server_app.git

cd gomibako_server_app

npm install

.env

PORT=3000

DATABASE_URL=

LINE_CHANNEL_ACCESS_TOKEN=

LINE_USER_ID=

FIREBASE_NOTIFY_URL=

FIREBASE_API_KEY=

起動

node server.js
今後の改善点
Docker対応
TypeScript化
CI/CD（GitHub Actions）
OpenAPI(Swagger)
Jestによる自動テスト
ログ管理の改善
認証機能追加
使用技術
Node.js
Express
PostgreSQL
Supabase
Firebase
Render
LINE Messaging API
REST API
