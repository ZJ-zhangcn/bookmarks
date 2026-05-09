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
import json, os, shutil, subprocess, time

STATE_PATH = os.environ.get('MONITOR_STATE_PATH', '/tmp/bookmarks-monitor-agent-state.json')


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


def meminfo():
    info = {}
    with open('/proc/meminfo', 'r', encoding='utf-8') as f:
        for line in f:
            key, rest = line.split(':', 1)
            info[key] = int(rest.strip().split()[0]) * 1024
    return info


def memory():
    info = meminfo()
    total = info.get('MemTotal', 0)
    free = info.get('MemAvailable', info.get('MemFree', 0))
    used = max(total - free, 0)
    return { 'total': total, 'used': used, 'free': free, 'usagePercent': round(used / total * 100, 2) if total else 0 }


def swap():
    info = meminfo()
    total = info.get('SwapTotal', 0)
    free = info.get('SwapFree', 0)
    used = max(total - free, 0)
    return { 'total': total, 'used': used, 'free': free, 'usagePercent': round(used / total * 100, 2) if total else 0 }


def disk():
    usage = shutil.disk_usage('/')
    return { 'total': usage.total, 'used': usage.used, 'free': usage.free, 'usagePercent': round(usage.used / usage.total * 100, 2) if usage.total else 0 }


def uptime():
    with open('/proc/uptime', 'r', encoding='utf-8') as f:
        return int(float(f.read().split()[0]))


def process_count():
    try:
        return sum(1 for name in os.listdir('/proc') if name.isdigit())
    except Exception:
        return 0


def docker_info():
    try:
        out = subprocess.check_output(['docker', 'ps', '-a', '--format', '{{.State}} {{.Status}}'], stderr=subprocess.DEVNULL, timeout=3, text=True)
    except Exception:
        return { 'running': 0, 'total': 0, 'unhealthy': 0 }
    lines = [line.strip() for line in out.splitlines() if line.strip()]
    return {
        'running': sum(1 for line in lines if line.startswith('running')),
        'total': len(lines),
        'unhealthy': sum(1 for line in lines if 'unhealthy' in line.lower())
    }


def network_totals():
    rx = 0
    tx = 0
    try:
        with open('/proc/net/dev', 'r', encoding='utf-8') as f:
            for line in f.readlines()[2:]:
                iface, stats = line.split(':', 1)
                iface = iface.strip()
                if not iface or iface == 'lo':
                    continue
                parts = [int(x) for x in stats.split()]
                if len(parts) >= 16:
                    rx += parts[0]
                    tx += parts[8]
    except Exception:
        pass
    return rx, tx


def network():
    now = time.time()
    rx, tx = network_totals()
    prev = None
    try:
        with open(STATE_PATH, 'r', encoding='utf-8') as f:
            prev = json.load(f)
    except Exception:
        prev = None
    try:
        with open(STATE_PATH, 'w', encoding='utf-8') as f:
            json.dump({ 'timestamp': now, 'rxBytes': rx, 'txBytes': tx }, f)
    except Exception:
        pass
    if not prev or now <= float(prev.get('timestamp', 0)):
        return { 'rxBytes': rx, 'txBytes': tx, 'rxRate': 0, 'txRate': 0 }
    seconds = now - float(prev.get('timestamp', 0))
    return {
        'rxBytes': rx,
        'txBytes': tx,
        'rxRate': round(max(0, (rx - int(prev.get('rxBytes', rx))) / seconds), 2),
        'txRate': round(max(0, (tx - int(prev.get('txBytes', tx))) / seconds), 2)
    }

payload = {
    'id': os.environ.get('MONITOR_SERVER_ID'),
    'name': os.environ.get('MONITOR_SERVER_NAME'),
    'region': os.environ.get('MONITOR_SERVER_REGION', ''),
    'role': os.environ.get('MONITOR_SERVER_ROLE', 'agent'),
    'metrics': {
        'cpu': { 'usage': cpu_usage(), 'cores': os.cpu_count() or 0 },
        'memory': memory(),
        'swap': swap(),
        'disk': disk(),
        'uptime': uptime(),
        'load': list(os.getloadavg()) if hasattr(os, 'getloadavg') else [],
        'network': network(),
        'docker': docker_info(),
        'process': { 'count': process_count() }
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
