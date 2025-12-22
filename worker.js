// worker.js
require('dotenv').config();
const db = require('./db');

const CHECK_INTERVAL = 10000; // 10秒ごとにチェック

// LINE Messaging API (Push Message) 送信関数
async function sendLinePushMessage(text) {
  const url = 'https://api.line.me/v2/bot/message/push';
  const body = {
    to: process.env.LINE_TARGET_ID, // .envの宛先(User ID or Group ID)
    messages: [{ type: 'text', text: text }]
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errData = await response.json();
      console.error('LINE API Error:', JSON.stringify(errData));
      return false;
    }
    return true;
  } catch (error) {
    console.error('Network Error:', error);
    return false;
  }
}

async function processQueue() {
  const client = await db.getClient();
  
  try {
    // トランザクション開始
    await client.query('BEGIN');

    // 1. 未処理のタスクを取得してロック (FOR UPDATE SKIP LOCKED)
    // これにより、もしWorkerを複数起動しても同じ通知を二重送信するのを防げる
    const selectQuery = `
      SELECT id, target_date, retry_count
      FROM notifications
      WHERE status = 'pending' 
         OR (status = 'failed' AND retry_count < 3)
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    
    const res = await client.query(selectQuery);
    
    // 対象がなければコミットして終了
    if (res.rows.length === 0) {
      await client.query('COMMIT');
      return; 
    }

    const task = res.rows[0];
    console.log(`[Worker] 通知処理開始 ID:${task.id} (Date: ${task.target_date})`);

    // 2. LINE送信実行
    const message = `🗑️ ゴミが満杯です！\n明日 (${task.target_date}) は回収日です。\n準備をお願いします。`;
    const isSuccess = await sendLinePushMessage(message);

    // 3. 結果に応じてDB更新
    if (isSuccess) {
      await client.query(
        "UPDATE notifications SET status = 'sent', retry_count = retry_count + 1 WHERE id = $1",
        [task.id]
      );
      console.log(' -> 送信成功 ✅');
    } else {
      await client.query(
        "UPDATE notifications SET status = 'failed', retry_count = retry_count + 1 WHERE id = $1",
        [task.id]
      );
      console.log(' -> 送信失敗 ❌ (リトライ予定)');
    }

    // トランザクション確定
    await client.query('COMMIT');

  } catch (err) {
    // エラー時はロールバック（ロック解放）
    await client.query('ROLLBACK');
    console.error('[Worker Error]', err);
  } finally {
    // コネクションをプールに戻す
    client.release();
  }
}

// ループ実行
console.log('Worker started (Messaging API)...');
setInterval(processQueue, CHECK_INTERVAL);