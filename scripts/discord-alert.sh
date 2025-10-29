#!/bin/bash
# Send a short alert message to a Discord webhook (used by alerting tools)
WEBHOOK_URL=${DISCORD_ALERT_WEBHOOK_URL:-""}
if [ -z "$WEBHOOK_URL" ]; then
  echo "DISCORD_ALERT_WEBHOOK_URL is not set" >&2
  exit 2
fi

MESSAGE=$1
if [ -z "$MESSAGE" ]; then
  MESSAGE="🚨 Alert from rectbot: (no message)"
fi

payload=$(jq -nc --arg c "$MESSAGE" '{content: $c}')

curl -sS -H "Content-Type: application/json" -X POST -d "$payload" "$WEBHOOK_URL"
