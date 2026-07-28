#!/usr/bin/env bash
# Usage: ./scripts/switch-provider.sh <provider>
# Switches AI_PROVIDER in .env and shows relevant config.
# Valid providers: disabled, nvidia, openai, anthropic, gemini, bedrock

set -euo pipefail

VALID_PROVIDERS=("disabled" "nvidia" "openai" "anthropic" "gemini" "bedrock")
PROVIDER="${1:-}"

if [[ -z "$PROVIDER" ]]; then
  echo "Usage: $0 <provider>"
  echo "Valid providers: ${VALID_PROVIDERS[*]}"
  exit 1
fi

# Validate provider name
FOUND=false
for p in "${VALID_PROVIDERS[@]}"; do
  if [[ "$p" == "$PROVIDER" ]]; then
    FOUND=true
    break
  fi
done

if [[ "$FOUND" == "false" ]]; then
  echo "Error: Invalid provider '$PROVIDER'"
  echo "Valid providers: ${VALID_PROVIDERS[*]}"
  exit 1
fi

ENV_FILE="$(dirname "$0")/../.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env file not found at $ENV_FILE"
  exit 1
fi

# Replace AI_PROVIDER value
sed -i "s/^AI_PROVIDER=.*/AI_PROVIDER=$PROVIDER/" "$ENV_FILE"

echo "✓ AI_PROVIDER switched to: $PROVIDER"
echo ""

# Show relevant config for the selected provider
case "$PROVIDER" in
  bedrock)
    echo "Using AWS credential chain (no API key needed)."
    echo "Models: Nova Micro (default) + Nova Pro (complex tasks)."
    grep -E "^BEDROCK_" "$ENV_FILE" || true
    ;;
  nvidia|openai|anthropic|gemini)
    PREFIX=$(echo "$PROVIDER" | tr '[:lower:]' '[:upper:]')
    echo "Ensure ${PREFIX}_API_KEY is set."
    grep -E "^${PREFIX}_" "$ENV_FILE" || true
    ;;
  disabled)
    echo "AI features are disabled. Fallback logic will be used."
    ;;
esac

echo ""
echo "Restart the backend for changes to take effect:"
echo "  pm2 restart backend  (or kill and re-run)"
