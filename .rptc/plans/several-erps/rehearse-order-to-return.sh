#!/bin/bash
# The order-to-return flow on Justrite, end to end, through Demo Builder's MCP tools.
# Usage: bash flow.sh   (run from the demo-builder-vscode worktree)
set -u
P=.claude/skills/mcp-live-probe/probe.mjs
W() { node $P call write_commerce_rest "$1" --force write_commerce_rest --timeout 320 2>&1 | sed -n 2p; }
R() { node $P call run_commerce_rest "{\"path\":\"$1\"}" 2>&1 | sed -n 2p; }
E() { node $P call write_erp_rest "{\"confirm\":true,\"id\":\"erp-integration\",\"erp\":\"$1\",\"method\":\"POST\",\"path\":\"$2\",\"body\":$3}" --force write_erp_rest --timeout 300 --full 2>&1; }
wait_for() { # $1 path, $2 regex, $3 label
  for i in $(seq 1 30); do out=$(R "$1"); if echo "$out" | grep -qE "$2"; then echo "  ok: $3"; return 0; fi; sleep 10; done
  echo "  TIMEOUT: $3 -> $out"; return 1; }
step() { echo; echo "== $1 ($(date -u +%H:%M:%SZ))"; }

step "1. Dana (Northgate) orders 1 Justrite shadow board + 2 Accuform signs, on account"
C=$(W '{"confirm":true,"method":"POST","path":"customers/49/carts","body":{}}' | tr -d '"')
W "{\"confirm\":true,\"method\":\"POST\",\"path\":\"carts/$C/items\",\"body\":{\"cartItem\":{\"quote_id\":\"$C\",\"sku\":\"51BSCB\",\"qty\":1,\"product_option\":{\"extension_attributes\":{\"configurable_item_options\":[{\"option_id\":\"313\",\"option_value\":252}]}}}}}" > /dev/null
W "{\"confirm\":true,\"method\":\"POST\",\"path\":\"carts/$C/items\",\"body\":{\"cartItem\":{\"quote_id\":\"$C\",\"sku\":\"ACC-MDAN\",\"qty\":2,\"product_option\":{\"extension_attributes\":{\"configurable_item_options\":[{\"option_id\":\"313\",\"option_value\":267}]}}}}}" > /dev/null
A='{"region":"Ohio","region_id":47,"region_code":"OH","country_id":"US","street":["100 Industrial Pkwy"],"postcode":"43215","city":"Columbus","firstname":"Dana","lastname":"Whitfield","telephone":"6145550100","email":"dana.whitfield@northgate-supply.example"}'
W "{\"confirm\":true,\"method\":\"POST\",\"path\":\"carts/$C/shipping-information\",\"body\":{\"addressInformation\":{\"shipping_address\":$A,\"billing_address\":$A,\"shipping_carrier_code\":\"flatrate\",\"shipping_method_code\":\"flatrate\"}}}" > /dev/null
O=$(W "{\"confirm\":true,\"method\":\"PUT\",\"path\":\"carts/$C/order\",\"body\":{\"paymentMethod\":{\"method\":\"companycredit\"}}}" | tr -d '"')
INC=$(R "orders/$O?fields=increment_id" | grep -oE '[0-9]{10}')
echo "  order entity $O, number $INC"

step "2. Both ERPs receive their part"
for i in $(seq 1 30); do T=$(node $P call get_erp_order_trace "{\"id\":\"erp-integration\",\"orderNumber\":\"$INC\"}" --full 2>&1); n=$(echo "$T" | grep -oE '"part":"sent"' | wc -l | tr -d ' '); [ "$n" -ge 2 ] && break; sleep 10; done
echo "$T" | grep -oE '"name":"[A-Za-z ]+ ERP","number":"[0-9]+","part":"[a-z]+"'
ERPNO=$(echo "$T" | grep -oE '"name":"Justrite ERP","number":"[0-9]+"' | grep -oE '[0-9]{10}')

step "3. Each ERP confirms, ships and posts its part"
for pair in demo-erp:1 demo-erp-2:2; do e=${pair%%:*}; q=${pair##*:}
  E $e "orders/$ERPNO/confirm" '{}' > /dev/null
  S=$(E $e "orders/$ERPNO/shipments" "{\"lines\":[{\"item\":10,\"qty\":$q}]}" | grep -oE '"number":"8[0-9]{9}"' | tail -1 | grep -oE '[0-9]{10}')
  echo "  $e shipment $S: $(E $e "orders/$ERPNO/shipments/$S/post" '{}' | grep -oE '"status":"posted"' | head -1)"
done
wait_for "orders/$O?fields=status" '"status":"complete"' "Commerce order Complete (shipped + invoiced per ERP)"
R "invoices?searchCriteria[filterGroups][0][filters][0][field]=order_id&searchCriteria[filterGroups][0][filters][0][value]=$O&searchCriteria[pageSize]=5&fields=items[increment_id,grand_total]"
ITEMS=$(R "orders/$O?fields=items[item_id,sku,parent_item_id]")
I1=$(echo "$ITEMS" | grep -oE '"item_id":[0-9]+,"sku":"51BSCU-BLBK"' | head -1 | grep -oE '[0-9]+' | head -1)
I2=$(echo "$ITEMS" | grep -oE '"item_id":[0-9]+,"sku":"ACC-MDAN-AL"' | head -1 | grep -oE '[0-9]+' | head -1)

step "4. Staff enter one return for both lines in Commerce"
RET=$(W "{\"confirm\":true,\"method\":\"POST\",\"path\":\"returns\",\"body\":{\"rmaDataObject\":{\"order_id\":$O,\"order_increment_id\":\"$INC\",\"store_id\":5,\"customer_id\":49,\"status\":\"pending\",\"items\":[{\"order_item_id\":$I1,\"qty_requested\":1,\"reason\":\"12\",\"condition\":\"7\",\"resolution\":\"5\",\"status\":\"pending\"},{\"order_item_id\":$I2,\"qty_requested\":2,\"reason\":\"11\",\"condition\":\"7\",\"resolution\":\"5\",\"status\":\"pending\"}]}}}" | grep -oE '"entity_id":[0-9]+' | head -1 | grep -oE '[0-9]+')
echo "  return entity $RET"
wait_for "returns/$RET?fields=status" '"status":"authorized"' "return Authorized (each ERP took its line)"
RNO=$(node $P call run_erp_rest '{"id":"erp-integration","path":"returns"}' --full 2>&1 | grep -oE '"number":"6[0-9]{9}"' | head -1 | grep -oE '[0-9]{10}')
RNO2=$(node $P call run_erp_rest '{"id":"erp-integration","erp":"demo-erp-2","path":"returns"}' --full 2>&1 | grep -oE '"number":"6[0-9]{9}"' | head -1 | grep -oE '[0-9]{10}')
echo "  Justrite return order $RNO, Accuform return order $RNO2"

step "5. Goods back: each ERP receives its return"
E demo-erp "returns/$RNO/receive" '{}' | grep -oE '"status":"received"' | head -1
E demo-erp-2 "returns/$RNO2/receive" '{}' | grep -oE '"status":"received"' | head -1
wait_for "returns/$RET?fields=status" '"status":"received"' "return Received"

step "6. Each ERP posts its credit memo (Accuform first)"
BAL0=$(R 'companyCredits?searchCriteria[filterGroups][0][filters][0][field]=company_id&searchCriteria[filterGroups][0][filters][0][value]=22&searchCriteria[pageSize]=2&fields=items[balance]')
E demo-erp-2 "returns/$RNO2/credit-memo" '{}' | grep -oE '"status":"credited"' | head -1
wait_for "orders/$O?fields=total_refunded" '"total_refunded":42.42' "Commerce credit memo for the Accuform line"
E demo-erp "returns/$RNO/credit-memo" '{}' | grep -oE '"status":"credited"' | head -1
wait_for "returns/$RET?fields=status" '"status":"processed_closed"' "return Processed and Closed"
R "orders/$O?fields=status,total_refunded"
R "creditmemos?searchCriteria[filterGroups][0][filters][0][field]=order_id&searchCriteria[filterGroups][0][filters][0][value]=$O&searchCriteria[pageSize]=5&fields=items[increment_id,grand_total]"
echo "  Northgate balance before credits: $BAL0"
echo "  after: $(R 'companyCredits?searchCriteria[filterGroups][0][filters][0][field]=company_id&searchCriteria[filterGroups][0][filters][0][value]=22&searchCriteria[pageSize]=2&fields=items[balance]')"
node $P call run_commerce_rest "{\"path\":\"returns/$RET/comments\"}" 2>&1 | sed -n 2p | grep -oE '"comment":"[^"]+"'
echo; echo "ORDER=$INC RETURN_ENTITY=$RET JUSTRITE_RETURN=$RNO ACCUFORM_RETURN=$RNO2"
