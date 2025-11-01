#!/bin/bash
# Push basic CPU/MEM metrics to Pushgateway (called from cron)
# Supports prod-like HTTPS with self-signed cert + basic auth.

set -euo pipefail

CPU=$(top -bn1 | awk '/Cpu\(s\)/{print $2+$4}')
MEM=$(free -m | awk '/Mem:/ {print $3}')

# For dev/prod-like emulation, default to local TLS reverse proxy
# Override with PUSHGATEWAY_URL to target real endpoint
PUSH_URL=${PUSHGATEWAY_URL:-"https://localhost:9443/metrics/job/xserver-bot"}

# Optional basic auth
AUTH_ARGS=()
if [[ -n "${PUSHGATEWAY_USER:-}" && -n "${PUSHGATEWAY_PASSWORD:-}" ]]; then
	AUTH_ARGS=( -u "${PUSHGATEWAY_USER}:${PUSHGATEWAY_PASSWORD}" )
fi

# TLS options: prefer custom CA, or allow insecure if explicitly set
TLS_ARGS=()
if [[ -n "${PUSHGATEWAY_CACERT:-}" && -r "${PUSHGATEWAY_CACERT}" ]]; then
	TLS_ARGS=( --cacert "${PUSHGATEWAY_CACERT}" )
elif [[ "${PUSHGATEWAY_INSECURE:-false}" == "true" ]]; then
	TLS_ARGS=( -k )
fi

curl_common=( --silent --show-error --fail "${AUTH_ARGS[@]}" "${TLS_ARGS[@]}" )

echo "bot_cpu_usage ${CPU}" | curl "${curl_common[@]}" --data-binary @- "$PUSH_URL"
echo "bot_mem_usage ${MEM}" | curl "${curl_common[@]}" --data-binary @- "$PUSH_URL"

exit 0
