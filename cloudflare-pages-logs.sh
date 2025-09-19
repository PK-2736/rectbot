#!/bin/bash

# Cloudflare Pages ログ確認スクリプト
# APIトークンを環境変数 CLOUDFLARE_API_TOKEN に設定してください

ACCOUNT_ID="74749d85b9c280c0daa93e12ea5d5a14"
API_BASE="https://api.cloudflare.com/client/v4"

# 色付き出力用
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

function check_token() {
    if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
        echo -e "${RED}エラー: CLOUDFLARE_API_TOKEN環境変数が設定されていません${NC}"
        echo "使用方法: export CLOUDFLARE_API_TOKEN=\"your_token_here\""
        exit 1
    fi
}

function api_call() {
    local endpoint="$1"
    curl -s -X GET "${API_BASE}${endpoint}" \
         -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
         -H "Content-Type: application/json"
}

function list_projects() {
    echo -e "${BLUE}📋 Cloudflare Pages プロジェクト一覧${NC}"
    echo "=================================="
    
    local response=$(api_call "/accounts/${ACCOUNT_ID}/pages/projects")
    echo "$response" | jq -r '.result[] | "🌐 \(.name) - \(.domains[0]) - Created: \(.created_on[:10])"'
}

function show_deployments() {
    local project_name="$1"
    echo -e "${BLUE}📊 ${project_name} のデプロイメント履歴${NC}"
    echo "=================================="
    
    local response=$(api_call "/accounts/${ACCOUNT_ID}/pages/projects/${project_name}/deployments?per_page=10")
    
    echo "$response" | jq -r '.result[] | 
        if .latest_stage.status == "success" then
            "✅ \(.short_id) - \(.latest_stage.status) - \(.created_on[:16]) - \(.deployment_trigger.metadata.commit_message // "N/A")"
        elif .latest_stage.status == "failure" then
            "❌ \(.short_id) - \(.latest_stage.status) - \(.created_on[:16]) - \(.deployment_trigger.metadata.commit_message // "N/A")"
        else
            "🔄 \(.short_id) - \(.latest_stage.status) - \(.created_on[:16]) - \(.deployment_trigger.metadata.commit_message // "N/A")"
        end'
}

function show_deployment_logs() {
    local project_name="$1"
    local deployment_id="$2"
    echo -e "${BLUE}📄 ${project_name}/${deployment_id} のデプロイメントログ${NC}"
    echo "=================================="
    
    local response=$(api_call "/accounts/${ACCOUNT_ID}/pages/projects/${project_name}/deployments/${deployment_id}/history/logs")
    echo "$response" | jq -r '.result.data[]? | .message' 2>/dev/null || echo "ログデータなし"
}

function main() {
    check_token
    
    case "${1:-list}" in
        "list")
            list_projects
            ;;
        "deployments")
            if [ -z "$2" ]; then
                echo -e "${RED}使用方法: $0 deployments <project_name>${NC}"
                exit 1
            fi
            show_deployments "$2"
            ;;
        "logs")
            if [ -z "$2" ] || [ -z "$3" ]; then
                echo -e "${RED}使用方法: $0 logs <project_name> <deployment_id>${NC}"
                exit 1
            fi
            show_deployment_logs "$2" "$3"
            ;;
        "help")
            echo -e "${YELLOW}Cloudflare Pages ログ確認ツール${NC}"
            echo ""
            echo "使用方法:"
            echo "  $0 list                           - プロジェクト一覧"
            echo "  $0 deployments <project_name>     - デプロイメント履歴"
            echo "  $0 logs <project_name> <dep_id>   - デプロイメントログ"
            echo ""
            echo "例:"
            echo "  $0 list"
            echo "  $0 deployments rectbot"
            echo "  $0 logs rectbot 739e2f29"
            ;;
        *)
            echo -e "${RED}不明なコマンド: $1${NC}"
            echo "使用方法: $0 {list|deployments|logs|help}"
            exit 1
            ;;
    esac
}

main "$@"