# The ERP serves its own screen from an action, opened by a keyed link

Status: proposed (2026-09-16). Backlog: AB-9.

## Why

The ERP (`demo-erp`) and the ERP integration (`commerce-erp-integration`) are separate apps
that deploy into one App Builder namespace, and a namespace has exactly one static site.
`aio app deploy` empties that site before uploading (`aio-lib-web` `deploy-web.js`; the
folder is the namespace, `aio-cli-lib-app-config` line 663, not configurable). Both apps ship
web pages, so each deploy wipes the other's. On Bodea the integration deployed last and the
ERP's screen is gone.

The ERP's screen also only works inside the Experience Cloud shell, because every ERP action
is `require-adobe-auth` and the shell is what supplies the token. A plain link cannot open it.

## Design

**The ERP stays a self-contained React app, in its own repo, and stops using the static
site.** Its screen is served by one ERP web action, `screen`, which returns the page, its
script and its stylesheet, and answers the page's data calls. The integration's static site
is then the only one in the namespace, and deploy order stops mattering.

Measured 2026-09-16: a minified production build is 759 KB of script and 702 KB of CSS.
Runtime limits an action's result to 1 MB (developer.adobe.com, Runtime system settings), so
each file is served as its own response. Code is limited to 22 MB.

**Routes of `demo-erp/screen/`** (`require-adobe-auth: false`, `include-ims-credentials: true`):

| Path | Answers |
|---|---|
| `/` | the page (asset paths are relative, so the trailing slash matters) |
| `/app.js`, `/app.css` | the built screen |
| `/api/<action>/<rest>` | key checked, then the ERP's own handler for `<action>`, run in-process |

The ERP's other actions keep `require-adobe-auth`; the integration still calls them with its
server-to-server token. Nothing about the integration changes.

**The key.**
- Demo Builder generates it (32 random bytes, base64url) the first time the ERP deploys,
  stores it in SecretStorage under `secretKey(project, 'demo-erp', 'ERP_SCREEN_KEY')`, and
  passes it in the ERP's deploy env. Never in the manifest, `.env`, logs, exports or a demo
  package.
- `screen` compares it in constant time and refuses every data call when it is unset.
- The page reads `?key=` once, keeps it in `sessionStorage`, removes it from the address bar,
  and sends it as a header.
- Removing the ERP deletes the key (reversibility).

**The link.** "Open ERP" sends `openErpScreen { id }`; the extension finds the ERP's
`…/web/demo-erp/screen` URL in its deployed URLs, adds `/?key=…`, and opens the browser. The
key never reaches the webview.

## How the two apps fit together

```
 ONE Adobe Developer Console workspace  =  ONE Runtime namespace  =  ONE static site
 ═══════════════════════════════════════════════════════════════════════════════════

 demo-erp repo (Demo Builder component: "ERP", kind system)
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │ screen/            React UI source ──build──┐                                  │
 │                                             ▼                                  │
 │ actions/screen/    serves page + app.js + app.css      ◄── key-protected door  │
 │                    and /api/<name> ─────────┐              (no Adobe sign-in)  │
 │                                             │ same handler, in-process         │
 │ actions/health, products, partners, …  ◄────┘          ◄── IMS-protected door │
 │                                                             (require-adobe-auth)│
 │ lib/               ALL business logic (pricing, orders, events, ledger)        │
 │                         │                                                      │
 │                         ▼                                                      │
 │                  App Builder Database (the ERP's records)                      │
 └──────────────────────────────────────────────────────────────────────────────┘
        ▲ key in link                                  ▲ server-to-server token
        │                                              │ (ERP_BASE_URL)
  ┌─────┴───────────────┐                              │
  │ SC's browser tab    │                              │
  │ "Open ERP" in       │                              │
  │ Demo Builder        │                              │
  └─────────────────────┘                              │
                                                       │
 commerce-erp-integration repo (Demo Builder component: "ERP integration")
 ┌─────────────────────────────────────────────────────┼────────────────────────┐
 │ src/commerce-backend-ui-2/web-src/  Admin UI SDK React UI                     │
 │        │ build + deploy                             │                         │
 │        ▼                                            │                         │
 │   STATIC SITE  <namespace>.adobeio-static.net       │  (only this app uses it)│
 │                                                     │                         │
 │ src/commerce-extensibility-1/actions/               │                         │
 │   erp/status, mirror, reset, …  ────────────────────┘                         │
 │   webhooks (prices, discounts, order create) ◄── Commerce calls these         │
 │   app-management/* (install, config)        ◄── Commerce App Management       │
 │ src/lib/erp.js      the ERP client                                            │
 └──────────────────────────────────────────────────────────────────────────────┘
        ▲ loads the page from the static site; hands it the user's token
        │                               page ──calls──► erp/* actions
  ┌─────┴──────────────────────────────┐
  │ Commerce Admin                     │
  │  System ▸ ERP integration  (iframe)│
  └────────────────────────────────────┘
```

React only draws the pages; every rule lives in `lib/` and runs in Adobe I/O Runtime. The page
runs in the browser of whoever opened it.

## Changes

### demo-erp
1. Move `web-src/` to `screen/` (`aio` treats a `web-src` folder's mere presence as a front
   end). Drop the Experience Cloud shell bootstrap and `@adobe/exc-app`; the API client calls
   `./api/<action>` with the key header.
2. A build script (esbuild) that turns `screen/` into a generated module the `screen` action
   bundles, run by a `pre-app-build` hook so a deploy always ships the current screen.
3. The `screen` action and its tests (routing, key refusal, in-process dispatch, the offline
   rule each handler already declares).
4. NOTICE and README: the shell loader is gone; the screen opens from Demo Builder.

### Demo Builder (this repo)
5. Catalog: the ERP declares its screen action and key var (JSON, schema, type — all three).
6. Deploy: generate-or-read the key and pass it in the ERP's env.
7. Remove: delete the key.
8. Dashboard: "Open ERP" uses `openErpScreen`; the card offers it when the screen URL exists.
   The old `system.url` open path is deleted.
9. Agent surface: `open_erp_screen` MCP tool (opens it; never returns the key).

### commerce-erp-integration
No change.

## Verification
- Unit tests in both repos; `npm run gate` here.
- Bodea: redeploy the ERP (its static deploy stops; the integration's page is untouched).
  Then:
  - "Open ERP" loads the screen with live counts;
  - `screen/api/health` with no key, or a wrong one, answers 401;
  - the integration's Commerce Admin screen still loads, and its install still reports
    succeeded.

## Cloud writes (each confirmed before it runs)
- Push `demo-erp` to GitHub (Demo Builder clones from `main`).
- Redeploy the ERP into Bodea.

## Open
- The key is in the first URL a browser opens, so it lands in that browser's history.
  Accepted for a demo ERP holding throwaway data (owner, 2026-09-16).
- Headroom: the script is 76% of the limit. If it grows, split it per tab.
