#!/usr/bin/env bash
# Step 02 round trip against a deployed datapack-store package (the Data Installer's
# database API, answered by our store).
#   step02-roundtrip.sh https://<namespace>.adobeioruntime.net
# Signs as the aio CLI's logged-in user (the Bearer the store's guard validates).
# Prints each step's status and a cut of the body; never prints the token.
set -u
BASE="${1:?namespace base url}"
TOKEN="$(aio config get ims.contexts.cli.access_token.token)"
API="$BASE/api/v1/web/datapack-store"
H=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')
NAME=step02-roundtrip; V=v1

step() { printf '%-30s ' "$1"; shift; curl -s -o /tmp/step02.out -w '%{http_code}' "$@"; echo " $(tr -d '\n' < /tmp/step02.out | cut -c1-200)"; }

step "create-datapack"             "${H[@]}" -X POST   "$API/create-datapack" -d "{\"datapack_name\":\"$NAME\",\"version\":\"$V\",\"display_name\":\"Round trip\",\"description\":\"step 02\"}"
step "create-datapack (again→409)" "${H[@]}" -X POST   "$API/create-datapack" -d "{\"datapack_name\":\"$NAME\",\"version\":\"$V\",\"display_name\":\"Round trip\"}"
step "add-data-item (2 rows)"      "${H[@]}" -X POST   "$API/add-data-item" -d "{\"datapack_name\":\"$NAME\",\"version\":\"$V\",\"data_type\":\"categories\",\"data\":[{\"category\":{\"id\":1}},{\"category\":{\"id\":2}}]}"
step "update-data-item (1 row)"    "${H[@]}" -X PUT    "$API/update-data-item" -d "{\"datapack_name\":\"$NAME\",\"version\":\"$V\",\"data_type\":\"categories\",\"data\":[{\"category\":{\"id\":3}}]}"
step "find-datapacks"              "${H[@]}"           "$API/find-datapacks?datapack_name=$NAME"
step "get-datapack-metadata"       "${H[@]}"           "$API/get-datapack-metadata?datapack_name=$NAME&version=$V"
step "get-data-item"               "${H[@]}"           "$API/get-data-item?datapack_name=$NAME&version=$V&data_type=categories"
step "batch-get-data-items"        "${H[@]}" -X POST   "$API/batch-get-data-items" -d "{\"datapack_name\":\"$NAME\",\"version\":\"$V\"}"
step "update-datapack-metadata"    "${H[@]}" -X PUT    "$API/update-datapack-metadata" -d "{\"datapack_name\":\"$NAME\",\"version\":\"$V\",\"shared\":true}"
step "promote-datapack-version"    "${H[@]}" -X POST   "$API/promote-datapack-version" -d "{\"datapack_name\":\"$NAME\",\"source_version\":\"$V\",\"target_version\":\"main\"}"
step "delete-data-item"            "${H[@]}" -X DELETE "$API/delete-data-item?datapack_name=$NAME&version=main&data_type=categories"
step "delete-datapack (main)"      "${H[@]}" -X DELETE "$API/delete-datapack?datapack_name=$NAME&version=main"
step "delete-datapack (v1)"        "${H[@]}" -X DELETE "$API/delete-datapack?datapack_name=$NAME&version=$V"
step "get-datapack-metadata after" "${H[@]}"           "$API/get-datapack-metadata?datapack_name=$NAME&version=$V"
step "no token → 401"              -H 'Content-Type: application/json' "$API/find-datapacks"
