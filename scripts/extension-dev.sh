#!/bin/sh
# Builds the browser extension from the working copy for a given instance and copies it, over SSH, to a folder that
# Chrome loads « unpacked » (e.g. a network share): after a change, run this, then « Reload » in chrome://extensions.
# No CI, no deployment. Settings (environment, or scripts/extension-dev.local, not in git):
#   EXTENSION_BASE  address of the Pantarr instance the extension talks to (https://pantarr.example.com)
#   DEV_SSH         SSH target holding the folder (root@nas.local)
#   DEV_DIR         folder on that host (/srv/data/Pantarr/extension)
#   DEV_SHOWN       how the folder is reached from the browser's computer, only printed (\\nas\share\Pantarr\extension)
set -e
here="$(dirname "$0")"
[ -f "$here/extension-dev.local" ] && . "$here/extension-dev.local"
: "${EXTENSION_BASE:?set EXTENSION_BASE (address of the instance)}" "${DEV_SSH:?set DEV_SSH}" "${DEV_DIR:?set DEV_DIR}"
cd "$here/../apps/api"
OUT="${TMPDIR:-/tmp}/pantarr-extension"
EXTENSION_BASE="$EXTENSION_BASE" EXTENSION_OUT="$OUT" NODE_OPTIONS=--max-old-space-size=1500 npx jest --selectProjects unit -w 1 src/extension/dev-build.spec.ts >/dev/null
ssh -o BatchMode=yes "$DEV_SSH" "mkdir -p '$DEV_DIR' && find '$DEV_DIR' -mindepth 1 -delete"
tar -C "$OUT" -cf - . | ssh -o BatchMode=yes "$DEV_SSH" "tar --no-same-owner -C '$DEV_DIR' -xf -"
printf '%s\n' "extension $(grep -o '"version": "[^"]*"' "$OUT/manifest.json") -> ${DEV_SHOWN:-$DEV_SSH:$DEV_DIR}"
