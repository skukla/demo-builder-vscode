# Structural-only patch spec — B2B account sidebar + company switcher

**Date:** 2026-06-19
**Source plans:** `~/Downloads/b2b-account-sidebar.md`, `~/Downloads/b2b-company-switcher.md`
(third doc `b2b-live-search-bar.md` is ~90% styling — shelved; see triage).
**Goal:** adopt the **structural/behavioral** changes only (no brand styling), as thin-layer code
patches (ADR-006) on the canonical B2B baseline.
**Baseline:** `adobe-commerce/boilerplate-b2b-template` (main). **Patches land in:**
`skukla/eds-demo-patches/b2b/` (LKG-pinned, applied at create/reset).

## The key finding — canonical already ships most of the structure

The docs were written against *some* storefront and assume features must be built. But
`boilerplate-b2b-template` already ships: `blocks/commerce-account-sidebar`, `commerce-account-nav`,
`blocks/fragment`, `blocks/header/renderAuthDropdown.js`, `renderCompanySwitcher.js`, and the
`@dropins/storefront-company-switcher` dep. So these are **small behavioral deltas**, not features —
which is exactly the thin-layer promise.

---

## Patch A — Account nav robustness (`blocks/commerce-account-nav/commerce-account-nav.js`, 94 lines)

**Canonical today:** renders nav items **inside** `events.on('auth/permissions', …)` (not render-first);
already skips on explicit `permissions[permission] === false`; also skips when
`!permissions.admin && !permissions[permission]` (i.e. **hidden unless granted**); reads a **single**
`permission` value (`|| 'all'`), no OR-list.

**Structural delta to adopt (no styling):**
1. **Render authored links immediately**, then re-render/refine when `auth/permissions` arrives
   (canonical is event-gated only → empty nav if permissions load late/never).
2. **Visible-by-default; hide only on explicit `false`** — drop the `!admin && !granted` skip.
   ⚠️ **Behavioral divergence from canonical, on purpose:** demos want features visible. This trades
   canonical's security-conscious default for demo-friendliness. Flag for sign-off; it is *structure*,
   not styling, so it fits "adopt structure."
3. **OR-list permissions** — split comma/newline `permission` text, show if **any** is granted.
4. **Blank-proof per item** — wrap each item's render so one malformed link/icon can't blank the rail.

**Already present (no patch):** explicit-`false`-hides.
**Drop:** the doc's "Styling" section (rail look, icons, chevrons, card shadows, brand colors) → brand
CSS layer, site tokens.

## Account-sidebar *layout* — NOT a code patch (a decision + an authoring convention)

The doc proposes two-column authored pages (30/70) + `/customer/nav` fragment + a runtime
`account-sidebar-layout` fallback class. But canonical already has a dedicated `commerce-account-sidebar`
block that loads `/customer/sidebar-fragment` — a **different sidebar model**. Adopting the doc's
authored-column approach would *compete with* canonical's block.

**Recommendation:** keep canonical's `commerce-account-sidebar` block; do **not** port the doc's
layout-fallback strategy. The two-column / `/customer/nav` part is an **authoring convention** (how the
demo's account pages are authored in DA) + already covered by the content-copy work (ADR-010,
`/customer/nav` fragment). So from this doc, the only real *code* patch is Patch A (nav robustness),
plus possibly Patch A2 below.

### Patch A2 (conditional, small) — Fragment-in-column preservation (`blocks/fragment/fragment.js`, 49 lines)

Canonical does `block.replaceChildren(...fragment.childNodes)` + `loadSections(main)`. The doc's
"preserve the host column width; don't promote fragment sections to top-level when inside an account
column" is a defensive delta **only if** that scenario actually breaks in our layout. Verify against a
live account page before patching; skip if canonical already preserves the column.

---

## Patch B — Company toggle in the auth dropdown (header block)

**Canonical today:** `renderAuthDropdown.js` authenticated menu = just `My Account` + `Logout` (no
company row). `renderCompanySwitcher.js` renders the dropin's `CompanySwitcher` container **inline in
the header nav tools** (`navTools.append`) — exactly the "renders nothing / hard to see" surface the
doc warns about.

**Structural delta to adopt (no styling):** add a custom company **toggle row inside the auth
dropdown**, built on the dropin **API** (not the inline container):
- **New files:** `blocks/header/renderCompanyToggle.js`, `blocks/header/companyToggleUtils.js` (dedup
  by normalized name, keep current company, `getCustomerCompanyInfo` → `{currentCompany, companies}`).
- **Diff `renderAuthDropdown.js`:** when authenticated (or `auth_dropin_user_token`), call
  `renderCompanyToggle(authenticatedUserMenu)` (between My Account and Logout); on unauth, remove
  `.company-toggle-menu-item`; wire via `events.on('authenticated', …, {eager:true})`.
- **Behavior:** on select → set company header, save `sessionStorage`, refresh group headers, emit
  `companyContext/changed`, reload/redirect. Keep the row visible on empty company sets (semantic
  empty-state). All **semantic** (a `Company` row, caret, `aria-current` + check, empty-state) — the
  *visual* caret/colors are styling.

**Drop:** the `header.css` changes (caret rotation visuals, colors). Keep only functional state CSS if
strictly needed (show/hide), authored in the brand layer.
**Coexistence decision:** the new dropdown toggle likely **replaces** the inline
`renderCompanySwitcher` call (don't render both). Confirm during implementation.

---

## Patch C — Live search bar — SHELVED

~90% styling ("recreate CMCO's navy/blue glass look"). Structural kernel is tiny (`header.js` toggling
`.is-open`/`aria-hidden`, a `search-view-all` wrapper, clear-on-close). Canonical header likely already
has working search. Adopt nothing unless that open/close behavior is genuinely missing from canonical.

---

## The seam discipline (makes "structure not styling" clean)

Each patch's JS must emit **semantic class hooks only** — no inline styles, no color literals in JS. All
color/spacing/shadow lives in the **brand CSS layer** (authored per brand with the site's tokens), which
we do *not* take from these docs. The patches carry the class-hook contract
(`.company-toggle-menu-item`, the nav item structure, etc.); the brand layer styles them.

## How to produce them (per patch, RPTC-shaped)

1. Pin the canonical file at LKG; capture the exact target lines.
2. Implement the structural delta only; emit semantic hooks; no brand styling.
3. Port the tests the docs already specify (nav permission cases; company dedup/normalization cases).
4. Express as a code patch under `eds-demo-patches/b2b/` (new files + diffs), LKG-gated.
5. Brand CSS authored separately per package.

## Recommendation

- **Patch A (nav robustness)** and **Patch B (company toggle)** are the two real structural patches —
  small, additive, high value. (This matches your "two documents.")
- **Defer/skip** the account-sidebar *layout* strategy (canonical has a sidebar block; the rest is
  authoring) and **Patch A2** (verify the column-break first).
- **Shelve** live-search (styling).
- **One sign-off needed:** Patch A's "visible-by-default" nav gating is a deliberate demo-oriented
  divergence from canonical's security default.
