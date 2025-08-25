from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter()

@router.get("/faq", response_class=HTMLResponse)
def faq():
    return """
    <html>
    <head>
        <title>FAQ | Discord Game募集Bot</title>
        <style>
            body { font-family: 'Segoe UI', sans-serif; background: #23272a; color: #fff; margin: 0; padding: 0; }
            .container { max-width: 700px; margin: 40px auto; background: #2c2f33; border-radius: 10px; box-shadow: 0 2px 8px #0005; padding: 32px; }
            h1 { color: #7289da; }
            h2 { color: #fff; }
            a { color: #7289da; text-decoration: none; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>よくある質問（FAQ）</h1>
            <h2>Q. Botの導入方法は？</h2>
            <p>A. DiscordサーバーにBotを招待し、必要な権限を付与してください。</p>
            <h2>Q. プレミアムプランの支払い方法は？</h2>
            <p>A. Stripeによるクレジットカード決済に対応しています。</p>
            <h2>Q. サブスクリプションの解約は？</h2>
            <p>A. Stripeの管理画面またはお問い合わせから解約できます。</p>
            <h2>Q. サポートはどこで受けられますか？</h2>
            <p>A. サポート用Discordサーバーまたはメールでご連絡ください。</p>
            <hr>
            <a href="/about">← Bot説明に戻る</a>
        </div>
    </body>
    </html>
    """

@router.get("/terms", response_class=HTMLResponse)
def terms():
    return """
    <html>
    <head>
        <title>利用規約 | Discord Game募集Bot</title>
        <style>
            body { font-family: 'Segoe UI', sans-serif; background: #23272a; color: #fff; margin: 0; padding: 0; }
            .container { max-width: 700px; margin: 40px auto; background: #2c2f33; border-radius: 10px; box-shadow: 0 2px 8px #0005; padding: 32px; }
            h1 { color: #7289da; }
            a { color: #7289da; text-decoration: none; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>利用規約</h1>
            <p>本サービス（Discord Game募集Bot）は、以下の条件に同意の上ご利用ください。</p>
            <ul>
                <li>本Botの利用は自己責任でお願いします。</li>
                <li>不正利用や迷惑行為は禁止です。</li>
                <li>有料プランの内容・価格は予告なく変更される場合があります。</li>
                <li>個人情報は適切に管理し、第三者に提供しません。</li>
            </ul>
            <p>詳細は運営までお問い合わせください。</p>
            <hr>
            <a href="/about">← Bot説明に戻る</a>
        </div>
    </body>
    </html>
    """

@router.get("/law", response_class=HTMLResponse)
def law():
    return """
    <html>
    <head>
        <title>特定商取引法に基づく表示 | Discord Game募集Bot</title>
        <style>
            body { font-family: 'Segoe UI', sans-serif; background: #23272a; color: #fff; margin: 0; padding: 0; }
            .container { max-width: 700px; margin: 40px auto; background: #2c2f33; border-radius: 10px; box-shadow: 0 2px 8px #0005; padding: 32px; }
            h1 { color: #7289da; }
            a { color: #7289da; text-decoration: none; }
        </style>
    </head>
    <body>
        <div class=\"container\">
            <h1>特定商取引法に基づく表示</h1>
            <ul>
                <li>販売事業者：Discord Game募集Bot運営</li>
                <li>運営責任者：pwy</li>
                <li>所在地：お問い合わせ時に遅滞なく開示</li>
                <li>連絡先：support@example.com</li>
                <li>販売価格：各プランごとに表示</li>
                <li>支払方法：クレジットカード（Stripe）</li>
                <li>サービス提供時期：決済完了後即時</li>
                <li>返品・キャンセル：サービスの性質上、原則不可</li>
                <li>動作環境：Discordが利用可能な環境</li>
            </ul>
            <hr>
            <a href=\"/about\">← Bot説明に戻る</a>
        </div>
    </body>
    </html>
    """

@router.get("/privacy", response_class=HTMLResponse)
def privacy():
    return """
    <html>
    <head>
        <title>プライバシーポリシー | Discord Game募集Bot</title>
        <style>
            body { font-family: 'Segoe UI', sans-serif; background: #23272a; color: #fff; margin: 0; padding: 0; }
            .container { max-width: 700px; margin: 40px auto; background: #2c2f33; border-radius: 10px; box-shadow: 0 2px 8px #0005; padding: 32px; }
            h1 { color: #7289da; }
            a { color: #7289da; text-decoration: none; }
        </style>
    </head>
    <body>
        <div class=\"container\">
            <h1>プライバシーポリシー</h1>
            <p>本サービスは、ユーザーのプライバシーを尊重し、個人情報を適切に管理します。</p>
            <ul>
                <li>取得する情報：Discordアカウント情報、メールアドレス、決済情報等</li>
                <li>利用目的：サービス提供・本人確認・サポート対応・決済処理</li>
                <li>第三者提供：法令等に基づく場合を除き、第三者に提供しません</li>
                <li>安全管理：適切な安全対策を講じます</li>
                <li>お問い合わせ：support@example.com</li>
            </ul>
            <hr>
            <a href=\"/about\">← Bot説明に戻る</a>
        </div>
    </body>
    </html>
    """
