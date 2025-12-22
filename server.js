// server.js
const express = require('express');
const db = require('./db');
const app = express();
const worker = require('./worker'); // ★追加: 作ったworkerを読み込む

app.use(express.json());

// ♻️ 設定: ゴミ回収曜日 (0=日, 1=月, 2=火, 3=水, 4=木, 5=金, 6=土)
// 例: 月曜(1) と 木曜(4) なら [1, 4]
// 例: 水曜だけなら [3]
const COLLECTION_DAYS = [1, 4]; 

/**
 * 日本時間を基準に、次の回収日(YYYY-MM-DD)を計算する関数
 */
//usecase//
function getNextCollectionDate() {
  // 1. 現在時刻を日本時間(JST)で取得
  //pcは「日本時間 (JST)」に設定されている。 なので、new Date() を実行すると、「日本時間」
  //Renderなどのクラウドサービスは、世界中の人が使うので、特定も国の時間ではなく 「世界標準時 (UTC)」 に設定されていることがほとんどです
  const now = new Date();
  const jstOffset = 9 * 60; // JSTはUTC+9時間      時間を分に変換
  const localNow = new Date(now.getTime() + (jstOffset + now.getTimezoneOffset()) * 60 * 1000);
  //now.getTimezoneOffset() は、現在のタイムゾーンとUTCの差を「分」で返すメソッド　　　*60　分を秒に変換　*1000 秒をミリ秒に変換

  // 2. 「明日」から順にループして、指定された曜日を探す
  // (今日が回収日でも、もう間に合わない想定で明日以降を探す設定にしています)
  for (let i = 1; i <= 7; i++) {
    const checkDate = new Date(localNow);
    //今日の日本基準の時間が入ったオブジェクトを生成。
    checkDate.setDate(localNow.getDate() + i); // 1日ずつ足す
    //setDate は、日付を設定するメソッド。　getDate() は、日付を取得するメソッド

    const dayOfWeek = checkDate.getDay(); // 曜日を取得 (0-6)

    // 設定した曜日に含まれていれば、その日を返す
    if (COLLECTION_DAYS.includes(dayOfWeek)) {
      return checkDate.toISOString().split('T')[0];
      //toISOString()
      //まずは、日付データを「世界標準の文字形式（ISO 8601形式）」に変換
      //例: 2024-06-15T15:00:00.000Z
      //split は 「指定した文字で、包丁のようにスパッと切断して分割する」 メソッド。
      //"T"の部分で分割して、[0]番目（=日付部分）を取得してreturn
    }
  }
  return null; // 基本ありえないがエラー回避
}

// ゴミ満杯検知用エンドポイント
app.post('/api/trash-full', async (req, res) => {
  try {
    // 日付計算ロジック（さっきの関数）
    const targetDate = getNextCollectionDate();
    //return してきたものを変数に受け取る。

    console.log(`[API] 満杯検知: 次回の回収日は ${targetDate} です。`);

    //repository//
    // 【修正箇所】 typeカラムを削除したSQLに変更
    const query = `
      INSERT INTO notifications (target_date, status)
      VALUES ($1, 'pending')
      ON CONFLICT (target_date) DO NOTHING
      RETURNING id;
    `;
    //「プレースホルダー（仮置き場）」 です。 SQLの中に直接変数を埋め込まず、あとから安全に値を代入するための「穴埋めマーク」

    // 【修正箇所】 SQLに渡すデータも targetDate ひとつだけにする
    const result = await db.query(query, [targetDate]);
    //db.query() は、db.js で定義した関数。 第一引数にSQL文、第二引数にプレースホルダー用の配列を渡す

    if (result.rows.length > 0) {//ユニーク制約違反していなかったら、idが一つ返ってくるはず
      console.log(` -> 予約完了 (ID: ${result.rows[0].id})`);
      res.json({ success: true, status: 'queued', date: targetDate });
    } else {
      console.log(' -> すでに予約済みのためスキップ');
      res.json({ success: true, status: 'already_exists', date: targetDate });
    }

  } catch (err) {
    console.error('[API Error]', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }

  // サーバー起動処理
  //Render側が勝手にPORTを指定してくるので、それを使うようにする
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`API Server running on port ${PORT}`);
  
    // ★追加: サーバー起動と同時に、定期実行タイマーもスイッチON！
    worker.start(); 
  });

});
