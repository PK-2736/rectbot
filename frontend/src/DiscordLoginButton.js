// DiscordログインボタンのReactコンポーネント雛形
import React from 'react';

const DiscordLoginButton = () => {
  const handleLogin = () => {
    window.location.href = '/api/auth/discord/login';
  };
  return (
    <button onClick={handleLogin} style={{background:'#5865F2',color:'#fff',padding:'10px 20px',borderRadius:'5px'}}>
      Discordでログイン
    </button>
  );
};

export default DiscordLoginButton;
