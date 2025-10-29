#!/bin/bash
# Push basic CPU/MEM metrics to Pushgateway (called from cron)

CPU=$(top -bn1 | awk '/Cpu\(s\)/{print $2+$4}')
MEM=$(free -m | awk '/Mem:/ {print $3}')

PUSH_URL=${PUSHGATEWAY_URL:-"https://prom.recrubo.net/metrics/job/xserver-bot"}

echo "bot_cpu_usage ${CPU}" | curl --silent --show-error --fail --data-binary @- "$PUSH_URL"
echo "bot_mem_usage ${MEM}" | curl --silent --show-error --fail --data-binary @- "$PUSH_URL"

exit 0
