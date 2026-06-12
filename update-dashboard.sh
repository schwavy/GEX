#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ne 2 ]; then
  echo "Usage: ./update-dashboard.sh <spx-0dte|spx-1dte|ndx-0dte|ndx-1dte> <csv-file>"
  exit 1
fi
node tools/update-data.mjs "$1" "$2"
