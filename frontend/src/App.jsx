import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import DiscordCallback from './DiscordCallback';

const DISCORD_CLIENT_ID = process.env.REACT_APP_DISCORD_CLIENT_ID;
const REDIRECT_URI = process.env.REACT_APP_DISCORD_REDIRECT_URI;
const OAUTH_URL = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20email`;

function Home() {
  return (
    <div>
      <h1>Hello, rectbot frontend!</h1>
      <a href={OAUTH_URL}>
        <button>Discordでログイン</button>
      </a>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/auth/callback" element={<DiscordCallback />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
