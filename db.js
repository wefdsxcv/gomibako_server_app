// db.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// エラーハンドリング（放置されたクライアントのエラーで落ちないように）
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = {
  // 通常のクエリ用
  //module.exports ＝ 「このファイルを読み込んだ人に渡すもの」 です。 ここでは、関数が2つ入った オブジェクト を渡しています。
  //「1番目にSQL、2番目にデータ配列を渡す」という順番は、絶対の決まり事です。text;sql文　params;パラメータ配列
  query: (text, params) => pool.query(text, params),
  // トランザクション制御用（clientを個別に取得）
  getClient: () => pool.connect(),
};