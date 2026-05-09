#!/usr/bin/env bash
set -euo pipefail

ENDPOINT="${MONITOR_ENDPOINT:-}"
TOKEN="${MONITOR_AGENT_TOKEN:-}"
SERVER_ID="${MONITOR_SERVER_ID:-$(hostname)}"
SERVER_NAME="${MONITOR_SERVER_NAME:-$SERVER_ID}"
SERVER_REGION="${MONITOR_SERVER_REGION:-}"
SERVER_ROLE="${MONITOR_SERVER_ROLE:-agent}"
INTERVAL="${MONITOR_INTERVAL:-15}"

if [[ -z "$ENDPOINT" || -z "$TOKEN" ]]; then
  echo "MONITOR_ENDPOINT and MONITOR_AGENT_TOKEN are required" >&2
  exit 1
fi

collect_payload() {
  python3 - <<'PY'
import json, os, shutil, time

def read_cpu():
    with open('/proc/stat', 'r', encoding='utf-8') as f:
        parts = [int(x) for x in f.readline().split()[1:8]]
    idle = parts[3] + parts[4]
    total = sum(parts)
    return total, idle

def cpu_usage():
    t1, i1 = read_cpu()
    time.sleep(0.2)
    t2, i2 = read_cpu()
    total = t2 - t1
    idle = i2 - i1
    return round((1 - idle / total) * 100, 2) if total > 0 else 0

def memory():
    info = {}
    with open('/proc/meminfo', 'r', encoding='utf-8') as f:
        for line in f:
            key, rest = line.split(':', 1)
            info[key] = int(rest.strip().split()[0]) * 1024
    total = info.get('MemTotal', 0)
    free = info.get('MemAvailable', info.get('MemFree', 0))
    used = max(total - free, 0)
    return { 'total': total, 'used': used, 'free': free, 'usagePercent': round(used / total * 100, 2) if total else 0 }

def disk():
    usage = shutil.disk_usage('/')
    return { 'total': usage.total, 'used': usage.used, 'free': usage.free, 'usagePercent': round(usage.used / usage.total * 100, 2) if usage.total else 0 }

def uptime():
    with open('/proc/uptime', 'r', encoding='utf-8') as f:
        return int(float(f.read().split()[0]))

payload = {
    'id': os.environ.get('MONITOR_SERVER_ID'),
    'name': os.environ.get('MONITOR_SERVER_NAME'),
    'region': os.environ.get('MONITOR_SERVER_REGION', ''),
    'role': os.environ.get('MONITOR_SERVER_ROLE', 'agent'),
    'metrics': {
        'cpu': { 'usage': cpu_usage(), 'cores': os.cpu_count() or 0 },
        'memory': memory(),
        'disk': disk(),
        'uptime': uptime(),
        'load': list(os.getloadavg()) if hasattr(os, 'getloadavg') else []
    }
}
print(json.dumps(payload, separators=(',', ':')))
PY
}

while true; do
  export MONITOR_SERVER_ID="$SERVER_ID"
  export MONITOR_SERVER_NAME="$SERVER_NAME"
  export MONITOR_SERVER_REGION="$SERVER_REGION"
  export MONITOR_SERVER_ROLE="$SERVER_ROLE"
  payload="$(collect_payload)"
  curl -fsS -m 10 \
    -H "Authorization: Bearer ${TOKEN}" \
    -H 'Content-Type: application/json' \
    -d "$payload" \
    "$ENDPOINT" >/dev/null || true
  sleep "$INTERVAL"
done
