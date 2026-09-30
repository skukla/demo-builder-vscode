# Live credit + availability checks at checkout (AB-19 / AB-20) — implementation design

The ERP endpoints exist (demo-erp: `POST partners/:id/credit-check {net}`, `POST products/availability {lines}`). This is the **Commerce side** that calls them at placement. Owner-agreed rule: `.rptc/plans/several-erps/pricing-and-live-checks.md`.

## What the research settled (2026-09-30)

**The webhook mechanism (recovered from the removed cart webhooks, AB-26z):**
- Synchronous Commerce webhooks are declared in `app.commerce.config.ts` under `webhooks: [...]`, each with a `webhook_method` (the Commerce hook point), `category`, `runtimeAction`, `timeout`, `soft_timeout`, `fallback_error_message`. The action is a `web: 'yes'` runtime action returning `operations([...])` / a noop to allow, or an error to block.
- **ACCS runs every webhook as `required` regardless of the flag** (memory `reference_commerce_webhook_required_ignored`). So a webhook that fails/times out at the Commerce level BLOCKS the operation with `fallback_error_message`.
- **Therefore the fallback (down ERP → accept) is achieved by the handler failing OPEN internally**: it calls the ERP with a short internal timeout (~6s, inside Commerce's ~10s hard timeout) and returns *allow* on any ERP timeout/error — exactly the removed `item-prices` handler's `catch → noop`. The handler blocks ONLY on a definitive credit denial. A down ERP never reaches the Commerce-timeout path.

**Reused infrastructure (do not rebuild):**
- `src/router/route-order.js` `ownersOf` / `splitLines` — splits an order's lines by owning ERP.
- `companyOfOrder` (`deps.companyIdOf`) — the buyer's Commerce company.
- `src/lib/key-map.js` `erpCustomerOf` — Commerce company → that ERP's partner id.
- `src/lib/erps.js` `loadErps` / `adapterFor` — the ERP list and per-ERP client.
- The async order routing already holds a part on `isBlocked(companyId, erpId)` (the ERP's *persisted* credit block). The live check adds the case the persisted block misses: **this order pushing the company over its limit**.

## The webhook_method to verify (NOT yet confirmed)

The cart webhooks hooked `plugin.out_of_process_totals_collector.api.get_total_modifications.*`. A **blocking, pre-placement** hook needs the placement method. Candidate (from Adobe Commerce webhooks): a `before`/`plugin` hook on the place-order path (e.g. `plugin.magento.quote.model.quote_management.place_order`). **This must be confirmed against Adobe's Commerce webhooks method list and proven live** — it could not be verified this session (deploy blocked). Until confirmed it is the one open unknown in the delivery wiring.

## The one product decision (owner) — refuse vs capture-and-hold

A definitive credit "no" (this order over the company's limit) can be handled two ways, and they change the build:

- **A — Refuse at checkout (synchronous placement webhook).** The order is never created; the shopper sees "exceeds your credit limit." Matches AB-20's scene ("place an over-limit order, watch it refused") and the owner's logged AB-20 rule (hard-stop on a definitive no). More build: a new blocking webhook + the `webhook_method` above. In a multi-ERP order, any one owning ERP's denial blocks the whole placement (a synchronous webhook cannot partially place).
- **B — Capture and hold (extend the async routing).** The order IS placed; the over-limit ERP's part is held (reusing the existing `isBlocked`/held-part mechanism + Partially Held status), a CSR resolves it. Simpler, reuses everything, no new webhook or `webhook_method`. But the order still goes through — no visible checkout refusal.

**Recommendation: A for credit** (it's what AB-20 asked for and what the owner's rule says), **and availability is always B-shaped** (never blocks — record each owning ERP's promise date on its part during routing; a shortfall ships later). Credit blocks at the door; availability is a promise recorded after.

The multi-ERP nuance (any ERP's credit denial blocks the whole checkout) is consistent with "one ERP *down* never stops checkout" — down/timeout fails open (allow); only a deliberate credit *denial* blocks. Down ≠ denied.

## Build plan

1. **Pure core** `src/lib/placement-checks.js` (mechanism-agnostic, TDD): given an order + `{erps, ownsSku, companyIdOf, erpCustomerOf, creditCheck, availability, currencyOf}`, split by owning ERP, and for each owning ERP report `{ erp, credit: {status, reason, net}, promises: [...] }`. Fail-open marks an unreachable ERP `unavailable`, never throws. The caller decides block vs hold.
2. **Delivery (pending decision A/B + `webhook_method`):** a `web:'yes'` action that runs the core and returns block (credit denied) / allow; availability promises recorded on the parts record.
3. **Config:** a `webhooks` entry in `app.commerce.config.ts`, `metadata.version` bump, manifest regenerate.
4. **Tests:** core unit tests (approved / over-limit → block / unreachable → allow / multi-ERP), action tests (fail-open on ERP error).
5. **Live proof (supervised edge, deploy-gated):** confirm the `webhook_method` fires and blocks; over-limit order refused; raise the limit on the ERP screen; order goes through.

Backlog: AB-19, AB-20.
