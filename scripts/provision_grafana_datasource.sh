#!/usr/bin/env bash
set -euo pipefail

# Usage:
# GRAFANA_URL=http://localhost:3000 GRAFANA_API_KEY=<api_key> ./scripts/provision_grafana_datasource.sh

GRAFANA_URL=${GRAFANA_URL:-http://localhost:3000}
API_KEY=${GRAFANA_API_KEY:-}

if [ -z "$API_KEY" ]; then
  echo "Please set GRAFANA_API_KEY environment variable (use an admin API key)"
  exit 1
fi

echo "Provisioning Grafana datasource 'Cloudflare-Recruits-API' to $GRAFANA_URL"

payload=$(cat <<-JSON
{
  "name": "Cloudflare-Recruits-API",
  "uid": "recruits-api",
  "type": "simpod-json-datasource",
  "access": "proxy",
  "url": "https://api.recrubo.net",
  "isDefault": false,
  "jsonData": {
    "tlsSkipVerify": true,
    "timeout": 30,
    "allowedHosts": ["api.recrubo.net"]
  }
}
JSON
)

resp=$(curl -sS -X POST "$GRAFANA_URL/api/datasources" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "$payload" )

echo "Response: $resp"

echo "Done. If you need to add service token headers, either add them via Grafana UI or extend this script to use secureJsonData (be careful with secrets)."
