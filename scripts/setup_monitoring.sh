#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

echo "Creating monitoring folders under $root/docker/monitoring/..."
mkdir -p "$root/docker/monitoring/grafana/provisioning/datasources"
mkdir -p "$root/docker/monitoring/grafana/provisioning/dashboards"
mkdir -p "$root/docker/monitoring/grafana/dashboards"

# If files already exist, do not overwrite
copy_if_missing() {
  src_path="$1"
  dst_path="$2"
  if [ ! -f "$dst_path" ]; then
    echo "Creating $dst_path"
    cat > "$dst_path" <<'EOF'
${3:-}
EOF
  else
    echo "Skipping existing $dst_path"
  fi
}

echo "Note: This script is idempotent and will not overwrite existing files."
echo "If you want to force recreate files, remove them first."

echo "Setup done. Review files under $root/docker/monitoring"

echo "To start the monitoring stack run:"
echo "  docker compose -f $root/docker-compose.monitoring.yml up -d"

echo "To add files to git (recommended on a new branch):"
echo "  git switch -c monitoring/setup-monitoring"
echo "  git add docker docker-compose.monitoring.yml scripts/setup_monitoring.sh"
echo "  git commit -m 'chore(monitoring): add monitoring compose and provisioning'"
