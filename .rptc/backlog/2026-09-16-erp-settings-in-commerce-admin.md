---
id: AB-10
kind: feature
area: app-builder
parent: AB-9
needs: []
value: med
status: backlog
---

# An "ERP" section in Commerce Admin where a business user configures the integration

The owner's picture (2026-09-16): a business user configures the ERP integration inside
Commerce Admin, the way the single-app ERP mock this work was adapted from does it. Examples:
which Commerce **website code** the ERP's orders belong to, what happens while the ERP is
offline, contract-price behaviour, and failure toggles for a live demo. The screens should
look like Commerce, so they are built with Adobe's App Builder React libraries
(`@adobe/aio-commerce-lib-admin-ui`, React Spectrum 2), which the integration already uses.

Today the integration contributes one page, **System ▸ ERP integration**, showing health, the
sync log and reset. It has no settings.

## What the reference app does

- Tabs in one React app, ordered the way a demo tells the story. The selected tab is in the
  URL hash (`#/orders`), so menu entries can deep-link and Back works.
- A Commerce Admin menu **section**, "ERP Simulator", with three items, each opening a tab.
  It is declared by a hand-written `registration` action on `commerce/backend-ui/1`.
- A Settings tab it built itself (not the App Management settings form): grouped settings, a
  line under each saying what it does, one Save, stored by its own action.

## What the platform allows (researched 2026-09-16)

- **One menu entry per app on `commerce/backend-ui/2`**, which is what the starter kit
  generates. `adminUi.menu` is a single object in `@adobe/aio-commerce-lib-app` 2.0.0 (the
  latest), placed under one of eight Commerce menus or, when `parentMenu` is omitted, under
  **Apps**. It has no sections or children.
  (developer.adobe.com/commerce/extensibility/app-management/installation/admin-ui-sdk)
- **`commerce/backend-ui/1` is deprecated** (Admin UI SDK 4.2.0 release notes, 2026-07-28), and
  its menu page says each app is limited to "one section and one menu".
  `@adobe/aio-commerce-lib-app` 1.8.0 removed v1 support, and App Management's `adminUi` is
  documented as not compatible with v1.
  (developer.adobe.com/commerce/extensibility/admin-ui-sdk/extension-points/menu/,
  …/extension-points/v2/, …/release-notes)
- Since Admin UI SDK 3.3.1, app menu items are grouped under the **Apps** main menu.
- **App Management has a built-in settings form**: `businessConfig.schema` in
  `app.commerce.config.ts` (lists and multi-selects, with options computed at run time, so a
  website picker can list the instance's real website codes). Values are read with
  `@adobe/aio-commerce-lib-config`. It renders under Apps ▸ App Management, not in our page.

So a top-level "ERP" section with several entries is not a supported shape. The documented
workaround is one app per menu entry.

## The likely shape

One menu entry, "ERP" (under Apps, or under Stores or Sales), opening one page with its own
navigation: Overview (today's page), Orders (the website-code mapping), Pricing, and a
Simulator. Each part gets its own URL so links can reach it.

Where the settings live is the open design question:

1. **The App Management settings form** (`businessConfig`): no settings screen to build,
   scoped by website, and read by a library the starter kit already has. It shows up where
   App Management puts it, not in the ERP page.
2. **Our own Settings page**, like the reference app: full control of the layout and wording,
   in the ERP page. We build the form and the storage, and the actions read from that storage.
3. **Both**: values stored through `businessConfig`, edited in our own page.

## Open

- Where a hand-registered v1 section would actually appear in current Commerce: not
  documented, and moot unless we accept a deprecated extension point.
- Whether Commerce refuses an app that registers both v1 and v2.
- Which settings the owner wants beyond the website code.
- Whether the Admin page and the ERP's own screen (served by the ERP, opened from Demo
  Builder with a key) should share any navigation. They are separate apps.

Filed 2026-09-16.

## Shipped so far

- 2026-09-16  docs(backlog): AB-10 — an ERP section in Commerce Admin for the integration's settings (`969cd57df`)
- 2026-09-17  docs(research): how Commerce webhooks and events reach an App Management app; orders move to events (`a106cabbc`)
- 2026-09-17  docs(plans): the ERP integration's Commerce Admin page becomes its settings page (`01a9e1d30`)
