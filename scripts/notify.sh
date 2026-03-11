#!/usr/bin/env bash
# Send a notification message to your Telegram chat.
# Usage: ./scripts/notify.sh "Your message here"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env file not found at $ENV_FILE" >&2
  exit 1
fi

get_env() {
  grep "^$1=" "$ENV_FILE" | head -1 | cut -d'=' -f2- | sed 's/^["'\'']\|["'\''"]$//g'
}

TOKEN="$(get_env TELEGRAM_BOT_TOKEN)"
CHAT_ID="$(get_env ALLOWED_CHAT_ID)"

if [ -z "$TOKEN" ] || [ -z "$CHAT_ID" ]; then
  echo "Error: TELEGRAM_BOT_TOKEN and ALLOWED_CHAT_ID must be set in .env" >&2
  exit 1
fi

MESSAGE="${1:-}"
if [ -z "$MESSAGE" ]; then
  echo "Usage: $0 \"message\"" >&2
  exit 1
fi

curl -s -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  -d "chat_id=${CHAT_ID}" \
  -d "text=${MESSAGE}" \
  -d "parse_mode=HTML" > /dev/null

echo "Sent."
