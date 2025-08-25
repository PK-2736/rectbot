from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter()

@router.get("/about", response_class=HTMLResponse)
def about():
    return """
    <html>
    <head>
        <title>Bot説明 | Discord Game募集Bot</title>
        <style>
            body { font-family: 'Segoe UI', sans-serif; background: #23272a; color: #fff; margin: 0; padding: 0; }
            .container { max-width: 700px; margin: 40px auto; background: #2c2f33; border-radius: 10px; box-shadow: 0 2px 8px #0005; padding: 32px; }
            h1 { color: #7289da; }
            a { color: #7289da; text-decoration: none; }
            .btn { background: #7289da; color: #fff; padding: 10px 24px; border-radius: 5px; text-decoration: none; font-weight: bold; }
            .btn:hover { background: #5b6eae; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Discord ゲーム募集Botについて</h1>
            <p>
                このBotは、Discordサーバーでゲームの募集を簡単・円滑に行うためのツールです。<br>
                <ul>
                    <li>ワンクリックで募集メッセージを作成</li>
                    <li>参加者の自動集計・通知</li>
                    <li>有料プランでさらに便利な機能も！</li>
                </ul>
            </p>
            <h2>主な機能</h2>
            <ul>
                <li>ゲーム募集メッセージの自動生成</li>
                <li>参加/辞退ボタン</li>
                <li>参加者リストの自動管理</li>
                <li>サブスクリプションによるプレミアム機能</li>
            </ul>
            <h2>有料プランについて</h2>
            <p>
                プレミアムプランでは、募集数の上限解除やカスタム通知など、さらに多くの便利機能が利用できます。<br>
                <a href="/subscription/stripe/start" class="btn">プレミアムに申し込む</a>
            </p>
            <h2>ログイン</h2>
            <p>
                <a href="/auth/discord/login" class="btn">Discordでログイン</a>
            </p>
            <hr>
            <p style="font-size:0.9em; color:#aaa;">&copy; 2025 Discord Game募集Bot</p>
        </div>
    </body>
    </html>
    """
