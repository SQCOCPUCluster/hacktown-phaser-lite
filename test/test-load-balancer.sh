#!/bin/bash

# Test script for Multi-GPU Load Balancer
# Now with flags/env config, robust parsing, summary, and optional Tailscale lookup

set -Eeuo pipefail

# ---------- Config (env + defaults) ----------
MAC_HOST=${MAC_OLLAMA_HOST:-localhost}
MAC_PORT=${MAC_OLLAMA_PORT:-11434}
WIN_HOST=${WIN_OLLAMA_HOST:-100.97.106.7}
WIN_PORT=${WIN_OLLAMA_PORT:-11434}
MODEL=${MODEL:-${OLLAMA_MODEL:-qwen3:8b}}
TIMEOUT=${TIMEOUT:-5}
INFER_TIMEOUT=${INFER_TIMEOUT:-10}
PROMPT=${PROMPT:-"Say hello in 3 words"}
NUM_PREDICT=${NUM_PREDICT:-5}
WIN_DEVICE=${WIN_DEVICE:-""} # optional Tailscale device name
QUICK=false                  # if true, skip inference
USE_COLOR=true
USE_EMOJI=true

# ---------- CLI parsing ----------
usage() {
  cat <<USAGE
Usage: $0 [options]

Options:
  --mac-host <host>        Mac Ollama host (default: $MAC_HOST)
  --mac-port <port>        Mac Ollama port (default: $MAC_PORT)
  --win-host <host>        Windows Ollama host (default: $WIN_HOST)
  --win-port <port>        Windows Ollama port (default: $WIN_PORT)
  --model <name>           Model name (default: $MODEL)
  --timeout <sec>          Connectivity timeout seconds (default: $TIMEOUT)
  --infer-timeout <sec>    Inference timeout seconds (default: $INFER_TIMEOUT)
  --prompt <text>          Prompt for inference (default: "$PROMPT")
  --num-predict <n>        Tokens to predict (default: $NUM_PREDICT)
  --win-device <name>      Tailscale device name to resolve Windows IP
  --quick                  Skip inference; connectivity + model checks only
  --no-color               Disable colored output
  --no-emoji               Disable emoji
  -h, --help               Show this help

Environment overrides (optional):
  MAC_OLLAMA_HOST, MAC_OLLAMA_PORT, WIN_OLLAMA_HOST, WIN_OLLAMA_PORT,
  MODEL or OLLAMA_MODEL, TIMEOUT, INFER_TIMEOUT, PROMPT, NUM_PREDICT,
  WIN_DEVICE
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mac-host) MAC_HOST="$2"; shift 2;;
    --mac-port) MAC_PORT="$2"; shift 2;;
    --win-host) WIN_HOST="$2"; shift 2;;
    --win-port) WIN_PORT="$2"; shift 2;;
    --model) MODEL="$2"; shift 2;;
    --timeout) TIMEOUT="$2"; shift 2;;
    --infer-timeout) INFER_TIMEOUT="$2"; shift 2;;
    --prompt) PROMPT="$2"; shift 2;;
    --num-predict) NUM_PREDICT="$2"; shift 2;;
    --win-device) WIN_DEVICE="$2"; shift 2;;
    --quick) QUICK=true; shift;;
    --no-color) USE_COLOR=false; shift;;
    --no-emoji) USE_EMOJI=false; shift;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown option: $1" >&2; usage; exit 2;;
  esac
done

# ---------- Colors & Emoji ----------
if $USE_COLOR; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; NC=''
fi

if $USE_EMOJI; then
  ok_emoji="✅"; warn_emoji="⚠️"; err_emoji="❌"; lab_emoji="🧪"
else
  ok_emoji="OK"; warn_emoji="WARN"; err_emoji="ERR"; lab_emoji="TEST"
fi

# ---------- Helpers ----------
has_cmd() { command -v "$1" >/dev/null 2>&1; }

json_grep_response() {
  # best-effort extraction of "response":"..." without jq
  echo "$1" | grep -o '"response":"[^"]*"' | cut -d '"' -f4 || true
}

get_jq_models() {
  # prints list of model identifiers from /api/tags JSON
  jq -r '.models[]?.model // empty'
}

model_in_list() {
  # args: model; reads list on stdin; matches exact or prefix before ':'
  local want="$1"
  awk -v want="$want" '
    {
      m=$0
      split(m, a, ":"); base=a[1]
      if (m==want || base==want) { found=1; exit }
    }
    END { if (found) exit 0; else exit 1 }
  ' >/dev/null 2>&1
}

curl_json() {
  # args: url timeout
  local url="$1"; local to="$2"
  curl -fsS --max-time "$to" "$url"
}

check_connectivity() {
  # args: name host port -> echoes status text; returns 0/1
  local name="$1" host="$2" port="$3"
  if curl -fsS --max-time "$TIMEOUT" "http://$host:$port/api/tags" -o /dev/null; then
    echo -e "${GREEN}$ok_emoji $name is accessible${NC}"
    return 0
  else
    echo -e "${RED}$err_emoji $name is not accessible${NC}"
    return 1
  fi
}

check_model() {
  # args: name host port model -> echoes status text; returns 0/1
  local name="$1" host="$2" port="$3" model="$4"
  local tags_json
  if ! tags_json=$(curl_json "http://$host:$port/api/tags" "$TIMEOUT" 2>/dev/null); then
    echo -e "${YELLOW}$warn_emoji Could not fetch tags from $name${NC}"
    return 1
  fi

  if has_cmd jq; then
    if echo "$tags_json" | get_jq_models | model_in_list "$model"; then
      echo -e "${GREEN}$ok_emoji $model model is installed on $name${NC}"
      return 0
    else
      echo -e "${YELLOW}$warn_emoji $model model not found on $name${NC}"
      return 1
    fi
  else
    if echo "$tags_json" | grep -q "$model"; then
      echo -e "${GREEN}$ok_emoji $model model is installed on $name${NC}"
      return 0
    else
      echo -e "${YELLOW}$warn_emoji $model model not found on $name${NC}"
      return 1
    fi
  fi
}

test_inference() {
  # args: name host port model -> echoes status text + brief response; returns 0/1
  local name="$1" host="$2" port="$3" model="$4"
  local payload
  payload=$(cat <<JSON
{
  "model": "$model",
  "prompt": "$PROMPT",
  "stream": false,
  "options": { "num_predict": $NUM_PREDICT }
}
JSON
)
  local res
  if ! res=$(curl -fsS --max-time "$INFER_TIMEOUT" "http://$host:$port/api/generate" -d "$payload" 2>/dev/null); then
    echo -e "${RED}$err_emoji $name inference failed${NC}"
    return 1
  fi

  local text=""
  if has_cmd jq; then
    text=$(echo "$res" | jq -r '.response // empty' 2>/dev/null || true)
  fi
  if [[ -z "$text" ]]; then
    text=$(json_grep_response "$res" || true)
  fi

  if [[ -n "$text" ]]; then
    echo -e "${GREEN}$ok_emoji $name inference successful${NC}"
    echo "   Response: $text"
    return 0
  else
    echo -e "${YELLOW}$warn_emoji $name inference returned no text${NC}"
    return 1
  fi
}

resolve_win_host_from_tailscale() {
  # If a Tailscale device name is provided and tailscale is available, resolve its IPv4
  local dev="$1"
  if [[ -z "$dev" ]]; then return 1; fi
  if ! has_cmd tailscale; then return 1; fi
  # Prefer: tailscale ip -4 <device>
  local ip
  if ip=$(tailscale ip -4 "$dev" 2>/dev/null | head -n1); then
    if [[ -n "$ip" ]]; then
      echo "$ip"
      return 0
    fi
  fi
  return 1
}

echo "$lab_emoji Testing Multi-GPU Load Balancer Setup"
echo "========================================"
echo ""

# Optional: resolve Windows host via Tailscale device
if [[ -n "$WIN_DEVICE" ]]; then
  if new_ip=$(resolve_win_host_from_tailscale "$WIN_DEVICE" 2>/dev/null); then
    echo -e "${YELLOW}$warn_emoji Resolved Windows host via Tailscale device '$WIN_DEVICE': $new_ip${NC}"
    WIN_HOST="$new_ip"
  else
    echo -e "${YELLOW}$warn_emoji Could not resolve Tailscale device '$WIN_DEVICE'. Using $WIN_HOST${NC}"
  fi
fi

# ---------- Mac checks ----------
echo "1️⃣  Testing Mac GPU ($MAC_HOST:$MAC_PORT)..."
mac_connect=false; mac_model=false; mac_infer=false
if check_connectivity "Mac GPU" "$MAC_HOST" "$MAC_PORT"; then mac_connect=true; fi
if $mac_connect; then if check_model "Mac GPU" "$MAC_HOST" "$MAC_PORT" "$MODEL"; then mac_model=true; fi; fi
if $mac_connect && $mac_model && ! $QUICK; then if test_inference "Mac GPU" "$MAC_HOST" "$MAC_PORT" "$MODEL"; then mac_infer=true; fi; fi
echo ""

# ---------- Windows checks ----------
echo "2️⃣  Testing Windows GPU ($WIN_HOST:$WIN_PORT)..."
win_connect=false; win_model=false; win_infer=false
if check_connectivity "Windows GPU" "$WIN_HOST" "$WIN_PORT"; then win_connect=true; fi
if $win_connect; then if check_model "Windows GPU" "$WIN_HOST" "$WIN_PORT" "$MODEL"; then win_model=true; fi; fi
if $win_connect && $win_model && ! $QUICK; then if test_inference "Windows GPU" "$WIN_HOST" "$WIN_PORT" "$MODEL"; then win_infer=true; fi; fi
echo ""

# ---------- Summary ----------
echo "========================================"
echo "Summary:"
status_line() { # args: label ok?
  local label="$1"; local ok="$2"
  if $ok; then
    echo -e "  ${GREEN}$ok_emoji $label${NC}"
  else
    echo -e "  ${RED}$err_emoji $label${NC}"
  fi
}
status_line "Mac connectivity" $mac_connect
status_line "Mac model present ($MODEL)" $mac_model
if ! $QUICK; then status_line "Mac inference" $mac_infer; fi
status_line "Windows connectivity" $win_connect
status_line "Windows model present ($MODEL)" $win_model
if ! $QUICK; then status_line "Windows inference" $win_infer; fi

echo ""
echo "Next steps:"
if ! $mac_connect; then echo -e "- ${YELLOW}Start Ollama on Mac: brew services start ollama${NC}"; fi
if $mac_connect && ! $mac_model; then echo -e "- ${YELLOW}Pull model on Mac: ollama pull $MODEL${NC}"; fi
if ! $win_connect; then echo -e "- ${YELLOW}Check Tailscale: tailscale status; ensure Windows Ollama listens on 0.0.0.0:$WIN_PORT${NC}"; fi
if $win_connect && ! $win_model; then echo -e "- ${YELLOW}Pull model on Windows: ollama pull $MODEL${NC}"; fi
echo "- Run: npm run dev"
echo "- Watch logs for load balancer activity"

# Exit non-zero if any critical step failed (connectivity or inference unless --quick)
fail=false
if ! $mac_connect || ! $win_connect; then fail=true; fi
if ! $QUICK && { ! $mac_infer || ! $win_infer; }; then fail=true; fi

if $fail; then exit 1; else exit 0; fi
