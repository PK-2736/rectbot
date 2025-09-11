import React, { useEffect, useState } from 'react';

function DiscordCallback() {
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) {
      setError('認証コードがありません');
      return;
    }
    // バックエンドAPIにcodeを送信してユーザー情報取得
    fetch('/api/discord/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setUser(data.user);
      })
      .catch(err => setError('通信エラー'));
  }, []);

  if (error) return <div>エラー: {error}</div>;
  if (!user) return <div>ログイン処理中...</div>;
  return (
    <div>
      <h2>Discordログイン成功</h2>
      <p>ユーザー名: {user.username}</p>
      <p>ID: {user.id}</p>
    </div>
  );
}

export default DiscordCallback;
