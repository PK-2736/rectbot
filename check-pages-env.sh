#!/bin/bash

echo "=== Checking Pages Environment Variables in Built Files ==="
echo ""

BUILD_DIR="frontend/dashboard/out"

if [ ! -d "$BUILD_DIR" ]; then
    echo "❌ Build directory not found: $BUILD_DIR"
    echo "Please run 'npm run build' first"
    exit 1
fi

echo "✅ Build directory found: $BUILD_DIR"
echo ""

# JavaScript ファイルから環境変数を検索
echo "Searching for environment variables in built JavaScript files..."
echo ""

# NEXT_PUBLIC_DISCORD_CLIENT_ID
if grep -r "NEXT_PUBLIC_DISCORD_CLIENT_ID" "$BUILD_DIR" > /dev/null 2>&1; then
    echo "⚠️  NEXT_PUBLIC_DISCORD_CLIENT_ID still exists (not replaced)"
else
    echo "✅ NEXT_PUBLIC_DISCORD_CLIENT_ID was replaced with actual value"
fi

# NEXT_PUBLIC_API_BASE_URL
if grep -r "NEXT_PUBLIC_API_BASE_URL" "$BUILD_DIR" > /dev/null 2>&1; then
    echo "⚠️  NEXT_PUBLIC_API_BASE_URL still exists (not replaced)"
else
    echo "✅ NEXT_PUBLIC_API_BASE_URL was replaced with actual value"
fi

# 実際の値を検索（セキュリティのため一部のみ表示）
echo ""
echo "Checking for actual values..."

if grep -r "api.rectbot.tech" "$BUILD_DIR" > /dev/null 2>&1; then
    echo "✅ Found 'api.rectbot.tech' in built files"
    COUNT=$(grep -r "api.rectbot.tech" "$BUILD_DIR" 2>/dev/null | wc -l)
    echo "   (Found in $COUNT locations)"
fi

if grep -r "discord.com/api/oauth2/authorize" "$BUILD_DIR" > /dev/null 2>&1; then
    echo "✅ Found Discord OAuth URL in built files"
fi

echo ""
echo "=== Summary ==="
echo "If environment variables were properly embedded:"
echo "  - Variable names (NEXT_PUBLIC_*) should NOT appear"
echo "  - Actual values (api.rectbot.tech, etc.) SHOULD appear"
echo ""
echo "If you see warnings above, environment variables were not set during build."
