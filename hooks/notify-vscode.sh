#!/bin/bash
# Usage: notify-vscode.sh <status>
# status: thinking | complete | permission | idle
STATUS="${1:-idle}"
SESSIONS_DIR="$HOME/.claude-cat-sessions"
mkdir -p "$SESSIONS_DIR"

INPUT=$(cat)

RESULT=$(echo "$INPUT" | python3 -c "
import sys, json, subprocess, re, os, platform

data = json.load(sys.stdin)
session_id = data.get('session_id', '')
transcript_path = data.get('transcript_path', '')
cwd = data.get('cwd', '')

IS_MAC = platform.system() == 'Darwin'

# Get title from transcript
title = ''
if transcript_path:
    try:
        with open(transcript_path) as f:
            for line in f:
                try:
                    d = json.loads(line)
                    if d.get('type') == 'ai-title':
                        title = d.get('aiTitle', '')
                except:
                    pass
    except:
        pass

# Find terminal shell PID via session socket
shell_pid = ''
session_short = session_id[:8]

if IS_MAC:
    try:
        lsof_out = subprocess.run(['lsof', '-U', '-n', '-P'],
                                   capture_output=True, text=True).stdout
        for line in lsof_out.split('\n'):
            if session_short in line:
                parts = line.split()
                if len(parts) >= 2:
                    pid = parts[1]
                    tty = subprocess.run(['ps', '-o', 'tty=', '-p', pid],
                                         capture_output=True, text=True).stdout.strip()
                    # macOS terminal TTY: s001, s002, ...
                    if re.match(r's\d+', tty):
                        ppid = subprocess.run(['ps', '-o', 'ppid=', '-p', pid],
                                               capture_output=True, text=True).stdout.strip()
                        if ppid:
                            shell_pid = ppid.strip()
                            break
    except:
        pass
else:
    try:
        ss_out = subprocess.run(['ss', '-xp'], capture_output=True, text=True).stdout
        for line in ss_out.split('\n'):
            if session_short in line:
                for m in re.finditer(r'pid=(\d+)', line):
                    pid = m.group(1)
                    tty = subprocess.run(['ps', '-o', 'tty=', '-p', pid],
                                         capture_output=True, text=True).stdout.strip()
                    if tty.startswith('pts/'):
                        ppid = subprocess.run(['ps', '-o', 'ppid=', '-p', pid],
                                               capture_output=True, text=True).stdout.strip()
                        if ppid:
                            shell_pid = ppid
                        break
            if shell_pid:
                break
    except:
        pass

# Fallback: match claude process by cwd
if not shell_pid and cwd:
    try:
        ps_out = subprocess.run(['ps', '-eo', 'pid,ppid,tty,comm'],
                                capture_output=True, text=True).stdout
        for line in ps_out.split('\n'):
            parts = line.split()
            if len(parts) < 4 or parts[3] != 'claude':
                continue
            tty = parts[2]
            if IS_MAC:
                tty_ok = re.match(r's\d+', tty)
            else:
                tty_ok = tty.startswith('pts/')
            if not tty_ok:
                continue
            try:
                if IS_MAC:
                    lsof_cwd = subprocess.run(
                        ['lsof', '-p', parts[0], '-a', '-d', 'cwd', '-Fn'],
                        capture_output=True, text=True).stdout
                    proc_cwd = next(
                        (ln[1:] for ln in lsof_cwd.split('\n') if ln.startswith('n')), '')
                else:
                    proc_cwd = os.readlink(f'/proc/{parts[0]}/cwd')
                if proc_cwd == cwd:
                    shell_pid = parts[1]
                    break
            except:
                pass
    except:
        pass

print(session_id + '|' + title + '|' + shell_pid)
" 2>/dev/null)

SESSION_ID=$(echo "$RESULT" | cut -d'|' -f1)
TITLE=$(echo "$RESULT" | cut -d'|' -f2)
SHELL_PID=$(echo "$RESULT" | cut -d'|' -f3)
FILE_KEY="${SESSION_ID:0:12}"

if [ -z "$FILE_KEY" ]; then
  if command -v md5sum >/dev/null 2>&1; then
    FILE_KEY=$(echo -n "$PWD" | md5sum | cut -c1-8)
  else
    FILE_KEY=$(echo -n "$PWD" | md5 -q | cut -c1-8)
  fi
fi

if [ "$STATUS" = "idle" ]; then
  rm -f "$SESSIONS_DIR/$FILE_KEY.json"
else
  TITLE_ESC=$(echo "$TITLE" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))" 2>/dev/null || echo "\"\"")
  SHELL_PID_JSON=$( [ -n "$SHELL_PID" ] && echo "$SHELL_PID" || echo "null")
  # SessionStart writes "idle" status (cat appears but not active yet)
  WRITE_STATUS="$STATUS"
  if [ "$STATUS" = "start" ]; then WRITE_STATUS="idle"; fi
  echo "{\"status\":\"$WRITE_STATUS\",\"timestamp\":$(date +%s),\"session\":\"$FILE_KEY\",\"session_id\":\"$SESSION_ID\",\"dir\":\"$PWD\",\"title\":$TITLE_ESC,\"shell_pid\":$SHELL_PID_JSON}" > "$SESSIONS_DIR/$FILE_KEY.json"
fi
