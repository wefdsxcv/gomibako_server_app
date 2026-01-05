// server.js
const express = require('express');
const db = require('./db');
const app = express();

app.use(express.json());

// 回収曜日の設定
const COLLECTION_DAYS = [1, 4]; 

/**
 * 日本時間基準で次の回収日を計算
 */
function getNextCollectionDate() {
    const now = new Date();
    const jstOffset = 9 * 60; 
    const localNow = new Date(now.getTime() + (jstOffset + now.getTimezoneOffset()) * 60 * 1000);

    for (let i = 1; i <= 7; i++) {
        const checkDate = new Date(localNow);
        checkDate.setDate(localNow.getDate() + i);
        if (COLLECTION_DAYS.includes(checkDate.getDay())) {
            return checkDate.toISOString().split('T')[0];
        }
    }
    return null;
}

/**
 * 満杯検知API
 * 【ステップ1】 リクエスト: M5StackからRenderへ
 */
app.post('/api/trash-full', async (req, res) => {
    try {
        const targetDate = getNextCollectionDate();
        console.log(`[Step 1 & 2] 処理開始: 対象日 ${targetDate}`);

        // --- Step 2 & 3: DB挿入 ＆ 重複判定 ---
        // 【ステップ2】 DB挿入試行 (Supabase)
        // 【ステップ3】 UNIQUE制約でエラーなら終了 (二重送信防止)
        const insertQuery = `
            INSERT INTO notifications (target_date, status)
            VALUES ($1, 'pending')
            ON CONFLICT (target_date) DO NOTHING
            RETURNING id;
        `;
        const result = await db.query(insertQuery, [targetDate]);

        if (result.rows.length === 0) {
            console.log(' -> [Step 3] すでに本日分はLINE送信済みのためスキップします。');
            return res.json({ success: true, message: 'Already processed today' });
        }

        const notificationId = result.rows[0].id;
        console.log(` -> [Step 3] DB登録成功 (ID: ${notificationId})`);

        // --- Step 4: LINE Messaging API 発火 ---
        // 【ステップ4】 fetchを使い、LINEにメッセージを送る
        const LINE_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
        const LINE_USER_ID = process.env.LINE_USER_ID; // 送信先のID
        
        console.log(' -> [Step 4] LINE API発火中...');
        const lineResponse = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
            },
            body: JSON.stringify({
                to: LINE_USER_ID,
                messages: [
                    {
                        type: 'text',
                        text: `🗑【ゴミ満杯通知】\nゴミ箱がいっぱいになりました！\n\n次回の回収日は【${targetDate}】です。出し忘れに注意しましょう！`
                    }
                ]
            })
        });

        if (!lineResponse.ok) {
            const errorData = await lineResponse.json();
            console.error('LINE API Error Detail:', errorData);
            throw new Error('LINE APIへの通知に失敗しました');
        }

        // --- Step 5: 成功したらステータス更新 ---
        // 【ステップ5】 通知が成功したら、Supabaseのstatusを 'sent' に更新
        await db.query(
            "UPDATE notifications SET status = 'sent' WHERE id = $1",
            [notificationId]
        );
        console.log(' -> [Step 5] LINE送信完了。ステータスを更新しました ✅');

        res.json({ success: true, status: 'sent', date: targetDate });

    } catch (err) {
        console.error('[Error]', err.message);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`API Server is running on port ${PORT}`);
});