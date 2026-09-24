#!/usr/bin/env bash

set -euo pipefail

COMMAND="${1:-}"

if [[ -z "$COMMAND" ]]; then
  echo "Usage: scripts/github/project-item.sh <add|set-stage>"
  exit 1
fi

if [[ -z "${GH_PROJECT_OWNER:-}" || -z "${GH_PROJECT_NUMBER:-}" || -z "${CONTENT_URL:-}" || -z "${GH_TOKEN:-}" ]]; then
  echo "Missing project configuration; skipping project item operation."
  exit 0
fi

resolve_project_owner() {
  local owner="$1"

  if [[ "$owner" == "@me" ]]; then
    printf '%s' "$owner"
    return
  fi

  local viewer_login
  viewer_login="$(gh api user --jq .login 2>/dev/null || true)"

  if [[ -n "$viewer_login" && "$owner" == "$viewer_login" ]]; then
    printf '%s' "@me"
    return
  fi

  printf '%s' "$owner"
}

PROJECT_OWNER="$(resolve_project_owner "$GH_PROJECT_OWNER")"

resolve_item_id() {
  gh project item-list "$GH_PROJECT_NUMBER" \
    --owner "$PROJECT_OWNER" \
    --format json \
    --jq ".items[] | select(.content != null and .content.url == \"$CONTENT_URL\") | .id" \
    | head -n 1
}

ensure_item() {
  local item_id
  item_id="$(resolve_item_id || true)"

  if [[ -n "$item_id" ]]; then
    printf '%s' "$item_id"
    return
  fi

  gh project item-add "$GH_PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$CONTENT_URL" >/dev/null
  item_id="$(resolve_item_id || true)"

  if [[ -z "$item_id" ]]; then
    echo "Unable to locate project item for $CONTENT_URL after adding it."
    exit 1
  fi

  printf '%s' "$item_id"
}

set_stage() {
  local item_id
  item_id="$(ensure_item)"

  if [[ -z "${GH_PROJECT_ID:-}" || -z "${GH_PROJECT_EXECUTION_STAGE_FIELD_ID:-}" || -z "${STAGE_OPTION_ID:-}" ]]; then
    echo "Stage metadata is incomplete; skipping stage update."
    return
  fi

  gh project item-edit \
    --id "$item_id" \
    --project-id "$GH_PROJECT_ID" \
    --field-id "$GH_PROJECT_EXECUTION_STAGE_FIELD_ID" \
    --single-select-option-id "$STAGE_OPTION_ID" >/dev/null
}

case "$COMMAND" in
  add)
    ensure_item >/dev/null
    ;;
  set-stage)
    set_stage
    ;;
  *)
    echo "Unknown command: $COMMAND"
    exit 1
    ;;
esac
