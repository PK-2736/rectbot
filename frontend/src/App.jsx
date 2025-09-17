import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import DiscordCallback from './DiscordCallback';
import Home from './Home';

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
