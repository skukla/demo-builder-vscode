#!/usr/bin/env bash
# Step 02 round trip against a deployed datapack-store package.
#   step02-roundtrip.sh https://<namespace>.adobeioruntime.net
# Signs as the aio CLI's logged-in user (the Bearer the store's guard validates).
# Prints each step's status; never prints the token.
set -u
BASE="${1:?namespace base url}"
TOKEN="$(aio config get ims.contexts.cli.access_token.token)"
API="$BASE/api/v1/web/datapack-store"
H=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')
NAME=step02-roundtrip; VERSION=v1

step() { printf '%-28s ' "$1"; shift; curl -s -o /tmp/step02.out -w '%{http_code}' "$@"; echo " $(cut -c1-160 /tmp/step02.out)"; }

step "save-pack (create)"      "${H[@]}" -X POST "$API/save-pack" -d "{\"name\":\"$NAME\",\"version\":\"$VERSION\",\"title\":\"Round trip\"}"
step "save-pack-items (2 rows)" "${H[@]}" -X POST "$API/save-pack-items" -d "{\"name\":\"$NAME\",\"version\":\"$VERSION\",\"data_type\":\"categories\",\"data\":[{\"category\":{\"id\":1}},{\"category\":{\"id\":2}}]}"
step "packs (list)"            "${H[@]}" "$API/packs"
step "packs (one)"             "${H[@]}" "$API/packs?name=$NAME&version=$VERSION"
step "save-pack (update)"      "${H[@]}" -X POST "$API/save-pack" -d "{\"name\":\"$NAME\",\"version\":\"$VERSION\",\"shared\":true}"
step "delete-pack"             "${H[@]}" -X DELETE "$API/delete-pack?name=$NAME&version=$VERSION&confirmName=$NAME"
step "packs (one, after)"      "${H[@]}" "$API/packs?name=$NAME&version=$VERSION"
step "no token → 401"          -H 'Content-Type: application/json' "$API/packs"
