---
name: extend-app-builder-app
description: Extend a Demo Builder project's AI-built App Builder integrations with new Adobe capabilities. Use when the user wants an integration to call an Adobe API it doesn't have yet (Firefly Services, Photoshop, etc.), when a new runtime action returns 401/403 from an Adobe service, or when planning what to build in an App Builder integration.
---

# Extend an App Builder Integration

Use this skill to grow an AI-built App Builder integration into a real
integration — securing Adobe API access BEFORE writing code that needs it.

## Per-integration addressing (read this first)

A project can hold **multiple AI-built integrations**. Each one lives in its
own `components/<id>/` folder with its own `app.config.yaml`, and each deploys
into its own isolated OpenWhisk (I/O Runtime) package — deploying one never
touches another.

Before editing anything, confirm WHICH integration (`components/<id>/`) the
user means. If more than one exists or the target is ambiguous, ask. All
edits and deploys below are per-integration, scoped to that folder.

## The workflow

1. **Confirm the target integration.** Identify the `components/<id>/` folder
   to work in (ask the user when it's ambiguous — see above).
2. **Clarify the goal.** Pin down the trigger (webhook, storefront call,
   schedule), the data in, and the result out. Example: "generate product
   imagery by calling Firefly Services from a Commerce webhook."
3. **Find the API's sdk code.** Call the `list_console_apis` MCP tool — it
   returns every Adobe service this org can subscribe to (code + name), and
   flags the ones Demo Builder already manages. Match by name (e.g. "Firefly").
4. **Confirm with the user, then subscribe.** Call `add_console_apis` with the
   sdk code(s). This adds the API to the project's Developer Console workspace
   credential and persists the choice so later component changes keep it.
   If the tool reports the service needs a product profile, direct the user to
   the Adobe Developer Console (Project → Workspace → Add API) instead.
5. **Build the action(s).** Add code under that integration's `actions/`
   directory and register each action in its `app.config.yaml`.
   **Ask the `commerce-extensibility` server BEFORE reading kit source to
   derive patterns**: `search-commerce-docs` ships the starter kit's own
   rules — eventing, PaaS/SaaS differences, action structure, onboarding.
   Measured 2026-08-28: a full starter-kit build session spent most of its
   cost re-deriving from source files what that server answers in one call,
   with the server sitting at zero uses.
6. **Deploy and verify.** Deploys are per-integration: run `aio app deploy`
   from that integration's `components/<id>/` directory (or the extensibility
   tooling's deploy tool), then hit the action URL (`aio app get-url`) before
   reporting success.

## Rules

- Never edit or deploy without confirming which integration
  (`components/<id>/`) the user means — a project can hold several.
- Never write code that calls an Adobe API before step 4 has succeeded — the
  action will fail at runtime with an auth error that looks like a code bug.
- `add_console_apis` changes cloud state; always confirm the exact service
  code(s) with the user first.
- No secrets in the integration folder; runtime credentials live in the
  gitignored `.env`.
