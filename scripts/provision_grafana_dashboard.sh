#!/usr/bin/env bash
set -euo pipefail

# Usage:
# GRAFANA_URL=http://localhost:3000 GRAFANA_API_KEY=<api_key> ./scripts/provision_grafana_dashboard.sh ./docker/monitoring/grafana/dashboards/recruits-dashboard.json

GRAFANA_URL=${GRAFANA_URL:-http://localhost:3000}
API_KEY=${GRAFANA_API_KEY:-}

if [ -z "$API_KEY" ]; then
  echo "Please set GRAFANA_API_KEY environment variable (use an admin API key)"
  exit 1
fi

DASHBOARD_FILE=${1:-}
if [ -z "$DASHBOARD_FILE" ] || [ ! -f "$DASHBOARD_FILE" ]; then
  echo "Usage: $0 /path/to/dashboard.json"
  exit 1
fi

echo "Provisioning dashboard from $DASHBOARD_FILE to $GRAFANA_URL"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required by this script. Install jq and try again."
  exit 1
fi

dash_json=$(jq -c . "$DASHBOARD_FILE")

# Wrap as Grafana expects
payload=$(cat <<-JSON
{
  "dashboard": $dash_json,
  "overwrite": true
}
JSON
)

resp=$(curl -sS -X POST "$GRAFANA_URL/api/dashboards/db" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "$payload")

echo "Response: $resp"
echo "Done. Dashboard should be visible in Grafana now."
