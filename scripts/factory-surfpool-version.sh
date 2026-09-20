#!/usr/bin/env bash
set -euo pipefail

expected="${1:?expected Surfpool version is required}"
[ "$(surfpool --version)" = "surfpool $expected" ]
