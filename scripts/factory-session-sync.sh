#!/usr/bin/env bash
# Refresh only a clean default-branch checkout. Feature work, dirt and local commits are preserved.
set -euo pipefail

remote_url="${1:?remote URL required}"
default_branch="$(git symbolic-ref --short refs/remotes/origin/HEAD | sed 's|^origin/||')"
current_branch="$(git branch --show-current)"
actual_head="$(git rev-parse HEAD)"
git fetch "$remote_url" "$default_branch"
remote_head="$(git rev-parse --verify 'FETCH_HEAD^{commit}')"
git update-ref "refs/remotes/origin/$default_branch" "$remote_head"

if [ -n "$(git status --porcelain)" ]; then
  echo "factory-session-sync: preserved dirty $current_branch at $actual_head" >&2
elif [ "$current_branch" != "$default_branch" ]; then
  echo "factory-session-sync: preserved feature branch $current_branch at $actual_head" >&2
elif [ "$actual_head" = "$remote_head" ]; then
  echo "factory-session-sync: $default_branch already current at $actual_head" >&2
elif git merge-base --is-ancestor "$actual_head" "$remote_head"; then
  git checkout -B "$default_branch" FETCH_HEAD
else
  echo "factory-session-sync: preserved diverged $default_branch at $actual_head; remote is $remote_head" >&2
fi
