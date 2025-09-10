# Discord OAuth2認証のFastAPIエンドポイント雛形
from fastapi import APIRouter, Request
import requests

router = APIRouter()

import os
DISCORD_CLIENT_ID = os.environ.get("DISCORD_CLIENT_ID")
DISCORD_CLIENT_SECRET = os.environ.get("DISCORD_CLIENT_SECRET")
DISCORD_REDIRECT_URI = os.environ.get("DISCORD_REDIRECT_URI")

@router.get("/auth/discord/login")
def discord_login():
    url = f"https://discord.com/oauth2/authorize?client_id={DISCORD_CLIENT_ID}&redirect_uri={DISCORD_REDIRECT_URI}&response_type=code&scope=identify%20email"
    return {"url": url}

@router.get("/auth/discord/callback")
def discord_callback(request: Request):
    code = request.query_params.get("code")
    if not code:
        return {"error": "code missing"}
    # Discordトークン取得
    token_url = "https://discord.com/api/oauth2/token"
    data = {
        "client_id": DISCORD_CLIENT_ID,
        "client_secret": DISCORD_CLIENT_SECRET,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": DISCORD_REDIRECT_URI,
        "scope": "identify email"
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    resp = requests.post(token_url, data=data, headers=headers)
    if resp.status_code != 200:
        return {"error": "discord token error", "detail": resp.text}
    access_token = resp.json().get("access_token")
    # ユーザー情報取得
    user_resp = requests.get(
        "https://discord.com/api/users/@me",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    if user_resp.status_code != 200:
        return {"error": "discord user error", "detail": user_resp.text}
    user = user_resp.json()
    return {"user": user}
