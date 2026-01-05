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
 * 【ステップ1】 リクエスト: M5StackがRenderのAPIエンドポイントを叩く
 */
app.post('/api/trash-full', async (req, res) => {
    try {
        const targetDate = getNextCollectionDate();
        console.log(`[Step 1 & 2] 処理開始: 対象日 ${targetDate}`);

        // --- Step 2 & 3: DB挿入 ＆ 重複判定 ---
        // 【ステップ2】 DB挿入試行: RenderからSupabaseに target_date を INSERT
        // 【ステップ3】 重複判定: UNIQUE制約(ON CONFLICT)で、すでに登録済なら何もしない
        const insertQuery = `
            INSERT INTO notifications (target_date, status)
            VALUES ($1, 'pending')
            ON CONFLICT (target_date) DO NOTHING
            RETURNING id;
        `;
        const result = await db.query(insertQuery, [targetDate]);

        // 重複していた場合（result.rows が空 ＝ すでに INSERT されている）
        if (result.rows.length === 0) {
            console.log(' -> [Step 3] すでに今日分は通知済みです。スキップします。');
            return res.json({ success: true, message: 'Already processed today' });
        }

        const notificationId = result.rows[0].id;
        console.log(` -> [Step 3] DB登録成功 (ID: ${notificationId})`);

        // --- Step 4: チームメンバーの Firebase API を叩く ---
        // 【ステップ4】 Firebase API 発火: fetchを使い、チームメンバーが作ったAPIを叩く
        // ※チームメンバーに「Firebase Cloud FunctionsなどのURL」をもらってください
        const FIREBASE_NOTIFY_URL = process.env.FIREBASE_NOTIFY_URL; 
        
        console.log(' -> [Step 4] Firebase API発火中...');
        const firebaseResponse = await fetch(FIREBASE_NOTIFY_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Firebase-API-Key': process.env.FIREBASE_API_KEY // 送付いただいたキー
            },
            body: JSON.stringify({
                to: "all_users", // チームの仕様に合わせる
                title: "ゴミ満杯通知",
                body: `明日（${targetDate}）はゴミ回収日です！`,
                data: { targetDate }
            })
        });

        if (!firebaseResponse.ok) {
            throw new Error('Firebase APIへの通知に失敗しました');
        }

        // --- Step 5: 成功したらステータス更新 ---
        // 【ステップ5】 最終更新: 通知が成功したら、Supabaseのstatusを 'sent' に更新
        await db.query(
            "UPDATE notifications SET status = 'sent' WHERE id = $1",
            [notificationId]
        );
        console.log(' -> [Step 5] 送信完了ステータスに更新しました ✅');

        res.json({ success: true, status: 'sent', date: targetDate });

    } catch (err) {
        console.error('[Error]', err);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`API Server is running on port ${PORT}`);
});