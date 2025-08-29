import './App.css';
import { useEffect, useState } from 'react';
import { useAppwriteRealtime } from './useAppwriteRealtime';

function App() {
  const [token, setToken] = useState(null);

  // クエリパラメータからtokenを取得しlocalStorageに保存
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (t) {
      setToken(t);
      localStorage.setItem('jwt_token', t);
      // トークン付きURLを消す（リロードで再認証しないように）
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      setToken(localStorage.getItem('jwt_token'));
    }
  }, []);

  // Vite では import.meta.env / CRA(Webpack) では process.env を使用。
  // Webpack で import.meta 参照すると警告が出るため使用しない。
  const API_BASE = process.env.REACT_APP_API_BASE_URL || process.env.VITE_API_BASE_URL || '';
  const handleDiscordLogin = () => {
    const url = API_BASE ? `${API_BASE}/auth/discord/login` : '/auth/discord/login';
    window.location.href = url;
  };

  // 例: plansコレクションのRealtime購読
  useAppwriteRealtime('collections.plans.documents', (event) => {
    console.log('Realtime event:', event);
    // 必要に応じてstate更新や通知処理を追加
  });

  return (
    <div className="container" style={{maxWidth:700,margin:'40px auto',background:'#2c2f33',borderRadius:10,boxShadow:'0 2px 8px #0005',padding:32,color:'#fff',fontFamily:'Segoe UI,sans-serif'}}>
      <nav style={{marginBottom:24}}>
        <a href="/about" style={{color:'#7289da',textDecoration:'none',marginRight:16}}>Bot説明</a>
        <a href="/faq" style={{color:'#7289da',textDecoration:'none',marginRight:16}}>FAQ</a>
        <a href="/terms" style={{color:'#7289da',textDecoration:'none',marginRight:16}}>利用規約</a>
        <a href="/law" style={{color:'#7289da',textDecoration:'none',marginRight:16}}>特商法</a>
        <a href="/privacy" style={{color:'#7289da',textDecoration:'none',marginRight:16}}>プライバシー</a>
        <a href="/admin" style={{color:'#7289da',textDecoration:'none',marginRight:16}}>管理画面</a>
      </nav>
      <h1 style={{color:'#7289da'}}>Discord Game募集Bot ホーム</h1>
      <p>このWebサイトは、Discordゲーム募集Botの管理・サブスクリプション・説明・サポートのためのポータルです。</p>
      <div style={{margin:'32px 0'}}>
        <button className="btn" style={{background:'#7289da',color:'#fff',padding:'10px 24px',borderRadius:5,textDecoration:'none',fontWeight:'bold',marginRight:10,border:'none',cursor:'pointer'}} onClick={handleDiscordLogin}>Discordでログイン</button>
        <a href="/subscription/stripe/start" className="btn" style={{background:'#7289da',color:'#fff',padding:'10px 24px',borderRadius:5,textDecoration:'none',fontWeight:'bold',marginRight:10}}>プレミアム申込</a>
      </div>
      {token && (
        <div style={{marginBottom:16,wordBreak:'break-all'}}>
          <b>JWT Token:</b>
          <div style={{fontSize:'0.9em',background:'#111',padding:8,borderRadius:4}}>{token}</div>
        </div>
      )}
      <ul>
        <li>Botの導入・使い方・機能説明</li>
        <li>有料プランの申込・管理</li>
        <li>FAQ・利用規約・特商法・プライバシーポリシー</li>
        <li>管理者向けサブスクリプション管理</li>
      </ul>
      <hr />
      <p style={{fontSize:'0.9em',color:'#aaa'}}>&copy; 2025 Discord Game募集Bot</p>
    </div>
  );
}

export default App;
