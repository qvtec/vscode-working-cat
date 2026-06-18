#!/bin/bash
# Usage: notify-vscode.sh <status>
# status: thinking | complete | permission | idle
STATUS="${1:-idle}"
echo "{\"status\":\"$STATUS\",\"timestamp\":$(date +%s)}" > "$HOME/.claude-cat-status.json"
