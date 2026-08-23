# Step 2 — Shell template repo + catalog entry

## Goal

An `app-builder-shell` catalog entry the user can pick in Add-an-Integration, which
deploys a minimal working app and lands the user in a repo purpose-seeded for AI-first
development.

## The template repo (external artifact — needs the maintainer's call on home/name)

Recommended: `skukla/app-builder-shell`, public. Contents:

- Minimal deployable App Builder app: `app.config.yaml` with ONE hello-world runtime
  action (so `aio app deploy` succeeds and the dashboard card shows a live URL), standard
  `package.json`, `.gitignore`, `.env.example` per App Builder conventions.
- **AI-first seed**: an `AGENTS.md` (and `CLAUDE.md` pointer) written for the
  build-it-with-AI loop:
  - what this shell is and what the user is expected to do next,
  - how to discover and request Console API access — "use the `list_console_apis` /
    `add_console_apis` Demo Builder MCP tools" (step 3) — with the Commerce+Firefly
    example spelled out,
  - pointer to the Developer Agent tooling (step 1) for App Builder patterns
    (`aio-app-dev`, `aio-app-deploy`, `search-commerce-docs`, …).
- NO secrets, no org-specific values (public repo).

## The catalog entry (`app-builder-components.json`)

```jsonc
{
  "id": "app-builder-shell",
  "name": "App Builder App (blank shell)",
  "description": "A minimal App Builder app to build out with AI — start from a working deploy and add what your demo needs.",
  "kind": "integration",
  "source": { "owner": "skukla", "repo": "app-builder-shell", "branch": "main" }
  // no compatibleBackends/compatibleFrontends → available on every stack
  // no requiredApis beyond the runner's baseline; APIs arrive at runtime via step 3
  // no envSchema, no providesEnvVars
}
```

## Verified: zero new mechanics needed

- Add-an-Integration lists catalog `kind: 'integration'` entries
  (`IntegrationsStep.tsx:91-96`) — the shell shows up with no UI work.
- Creation Phase 3b + dashboard add both route through `addAppBuilderComponent`
  (subscribe → clone+install → deploy → persist → card).
- The catalog-loader structural test pins "exactly the three meshes" by source
  (`appBuilderComponentCatalogLoader.test.ts:126-133`) — update it for the fourth entry.

## TDD

- Catalog loader test: fourth entry present, `kind: 'integration'`, valid per the schema's
  required fields.
- Selection tests: shell is selectable on every backend/frontend axis.
- Live F5 check: pick shell in wizard → project creates → dashboard card Deployed →
  hello-world action URL responds.

## Risk

- `aio app deploy` on a fresh clone needs `npm install` first — confirm
  `componentManager.installComponent` runs install for app-builder components (it does for
  the mesh components; verify same path).
