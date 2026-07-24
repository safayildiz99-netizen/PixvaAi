#!/bin/bash
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js fehlt. Bitte zuerst Node.js 20.19 oder neuer installieren."
  read -n 1 -s -r -p "Taste drücken zum Beenden …"
  exit 1
fi
[ -d node_modules ] || npm install
[ -d server/node_modules ] || npm install --prefix server
[ -d client/node_modules ] || npm install --prefix client
(sleep 4; open "http://localhost:5173") &
npm run dev
