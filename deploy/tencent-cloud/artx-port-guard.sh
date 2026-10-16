#!/bin/bash
# ArtX 端口守卫：artx-gray-backend 启动前清理「服务外」占用 3002 的进程。
#
# 背景（2026-10-15 事故）：调试时有人以 root 手动 `node ./dist/index.js` 占住 3002，
# systemd 起的正式进程反复 EADDRINUSE 崩溃，重启 125+ 次、站点停摆约 3 小时。
#
# 由 systemd drop-in 以 ExecStartPre=+ 调用。此时本服务旧主进程已被 systemd 停掉，
# 所以此刻还在监听端口的，一定是服务外的进程。
#   - 是 ArtX 后端自己（cmdline 含 dist/index.js 的 node）→ 记录后 TERM，10 秒不退再 KILL
#   - 是别的程序 → 不乱杀，记录并退出 1，让 systemd 报明确的失败原因
#
# 用法：artx-port-guard.sh [端口]   默认 3002

set -uo pipefail

PORT="${1:-3002}"
LOG=/var/log/artx/port-guard.log
mkdir -p /var/log/artx

log() {
  local msg="[port-guard] $(date '+%Y-%m-%d %H:%M:%S') port=${PORT} $*"
  echo "$msg" >> "$LOG"
  echo "$msg" >&2
  logger -t artx-port-guard -- "$*" 2>/dev/null || true
}

holders() {
  ss -Htlnp "sport = :${PORT}" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u
}

pids="$(holders)"
[ -z "$pids" ] && exit 0

for pid in $pids; do
  cmd="$(tr '\0' ' ' < "/proc/${pid}/cmdline" 2>/dev/null)"
  user="$(ps -o user= -p "$pid" 2>/dev/null | tr -d ' ')"
  started="$(ps -o lstart= -p "$pid" 2>/dev/null)"
  if [[ "$cmd" == *node* && "$cmd" == *dist/index.js* ]]; then
    log "发现服务外的 ArtX 进程占用端口：pid=${pid} user=${user} started='${started}' cmd='${cmd}'，正在结束"
    kill -TERM "$pid" 2>/dev/null
  else
    log "端口被非 ArtX 程序占用：pid=${pid} user=${user} cmd='${cmd}'，拒绝自动结束，请人工处理"
    exit 1
  fi
done

for _ in $(seq 1 20); do
  [ -z "$(holders)" ] && { log "端口已释放"; exit 0; }
  sleep 0.5
done

for pid in $(holders); do
  log "pid=${pid} 10 秒未退出，强制结束"
  kill -KILL "$pid" 2>/dev/null
done
sleep 1
[ -z "$(holders)" ] && { log "端口已释放（强制）"; exit 0; }
log "端口仍被占用，放弃"
exit 1
