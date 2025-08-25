from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, JSONResponse
import os
from appwrite.client import Client
from appwrite.services.account import Account
from appwrite.services.databases import Databases

router = APIRouter()

@router.get("/admin", response_class=HTMLResponse)
def admin_page():
    return """
    <html>
    <head>
        <title>管理画面 | Discord Game募集Bot</title>
        <style>
            body { font-family: 'Segoe UI', sans-serif; background: #23272a; color: #fff; margin: 0; padding: 0; }
            .container { max-width: 700px; margin: 40px auto; background: #2c2f33; border-radius: 10px; box-shadow: 0 2px 8px #0005; padding: 32px; }
            h1 { color: #7289da; }
            table { width: 100%; border-collapse: collapse; margin-top: 24px; }
            th, td { border: 1px solid #444; padding: 8px; text-align: left; }
            th { background: #7289da; color: #fff; }
            tr:nth-child(even) { background: #23272a; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>管理画面</h1>
            <p>サブスクリプションユーザー一覧を表示します。</p>
            <div id="user-table"></div>
            <script>
                fetch('/admin/subscriptions').then(r=>r.json()).then(data=>{
                    let html = '<table><tr><th>Discord ID</th><th>プラン</th><th>有効期限</th></tr>';
                    for(const row of data) {
                        html += `<tr><td>${row.discord_id}</td><td>${row.plan}</td><td>${row.expires_at}</td></tr>`;
                    }
                    html += '</table>';
                    document.getElementById('user-table').innerHTML = html;
                });
            </script>
        </div>
    </body>
    </html>
    """

@router.get("/admin/subscriptions")
def admin_subscriptions():
    client = Client()
    client.set_endpoint(os.getenv("APPWRITE_ENDPOINT")).set_project(os.getenv("APPWRITE_PROJECT_ID")).set_key(os.getenv("APPWRITE_API_KEY"))
    db = Databases(client)
    try:
        docs = db.list_documents(database_id="subscriptions", collection_id="plans")
        result = [
            {
                "discord_id": d["discord_id"],
                "plan": d["plan"],
                "expires_at": d["expires_at"]
            } for d in docs["documents"]
        ]
        return JSONResponse(result)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
