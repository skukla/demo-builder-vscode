# Step 01 — B2B-ready prerequisite doc + read-only `storeConfig` detection

**Goal:** For hybrid (B2B-code) packages, (a) surface a clear "backend must be B2B-ready"
prerequisite, and (b) reliably **detect** B2B enablement read-only so we can warn — never
silently ship a half-working B2B demo. The builder cannot *enable* B2B (no API; see research), so
this is guidance + detection only.

## Why / API findings (research-confirmed)

Enabling B2B is Admin/CLI + module-install (PaaS) or Adobe-provisioned (SaaS); **no public
enable-API**. But the GraphQL **`storeConfig`** query exposes B2B flags (`is_requisition_list_active`,
negotiable-quote config) via an **unauthenticated storefront token** — a reliable, lightweight
"is B2B on?" probe.

## Test-first (RED)

New `tests/features/eds/services/b2bReadinessDetection.test.ts` (mock GraphQL fetch):

1. `detectB2bReadiness(storefrontEndpoint)` returns `{ status: 'enabled' }` when `storeConfig`
   returns `is_requisition_list_active: true`.
2. Returns `{ status: 'disabled' }` when the flag is present and `false` → triggers a warning.
3. Returns `{ status: 'unknown' }` when the field is absent / query errors / endpoint unsupported
   (older schema or ACCS variance) → **no warning** (defensive: true-negative-only).
4. Detection is read-only, needs no admin token, and never throws into the create flow (failures
   degrade to `unknown`).
5. The warning surfaces via the existing patch-report / pipeline notification path (advisory, not
   fatal) — assert it does not abort create.

## Implement (GREEN)

- New `src/features/eds/services/b2bReadinessDetection.ts`: a small GraphQL `storeConfig` query for
  `is_requisition_list_active` (+ quote flag if available); map to `enabled | disabled | unknown`.
  Reuse the storefront endpoint the store-discovery / mesh config already knows.
- Wire into the create pipeline **only for B2B-code packages** (gate on the package being on
  `boilerplate-b2b-template`). On `disabled`, emit an advisory warning naming the prerequisite; on
  `unknown`/`enabled`, stay silent.
- Add a **prerequisite note** to the package's user-facing guidance (e.g. AGENTS.md / project docs
  or a wizard hint): "This B2B demo needs the connected Commerce backend to have B2B enabled
  (Admin → Stores → Configuration → General → B2B Features → Enable Company), with at least one
  company and one individual customer." Keep wording aligned with Adobe docs.

## Files

- New `src/features/eds/services/b2bReadinessDetection.ts` + test.
- Pipeline wiring (where B2B-code packages run): `edsPipeline.ts` / package-aware hook.
- Prerequisite copy: project docs / AGENTS.md writer (`aiContextWriter.ts`) or wizard hint.

## Acceptance

- True-negative-only: warns iff `is_requisition_list_active === false`; silent on enabled/unknown.
- No admin auth; never aborts create. PaaS verified against a mocked schema; ACCS degrades to
  `unknown` cleanly if the field is absent (confirm the field on a live ACCS during verification).
- Prerequisite guidance visible for hybrid packages.

## Notes

- Detection is a courtesy guardrail, not a gate — the demo can still be created; we just tell the
  user why B2B features may not show.
- Confirm on a live ACCS whether `storeConfig` carries the B2B flags; if not, ACCS relies on the
  prerequisite doc alone (still fine).
