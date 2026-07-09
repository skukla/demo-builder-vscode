---
name: extend-app-builder-app
description: Extend a Demo Builder project's App Builder app (e.g. the blank shell) with new Adobe integrations. Use when the user wants their custom app to call an Adobe API it doesn't have yet (Firefly Services, Photoshop, etc.), when a new runtime action returns 401/403 from an Adobe service, or when planning what to build in an attached App Builder app.
---

# Extend an App Builder App

Use this skill to grow an attached App Builder app (such as the blank shell)
into a real integration — securing Adobe API access BEFORE writing code that
needs it.

## The workflow

1. **Clarify the goal.** Pin down the trigger (webhook, storefront call,
   schedule), the data in, and the result out. Example: "generate product
   imagery by calling Firefly Services from a Commerce webhook."
2. **Find the API's sdk code.** Call the `list_console_apis` MCP tool — it
   returns every Adobe service this org can subscribe to (code + name), and
   flags the ones Demo Builder already manages. Match by name (e.g. "Firefly").
3. **Confirm with the user, then subscribe.** Call `add_console_apis` with the
   sdk code(s). This adds the API to the project's Developer Console workspace
   credential and persists the choice so later component changes keep it.
   If the tool reports the service needs a product profile, direct the user to
   the Adobe Developer Console (Project → Workspace → Add API) instead.
4. **Build the action(s).** Add code under the app's `actions/` directory and
   register each action in `app.config.yaml`. Prefer the
   `commerce-extensibility` MCP tools (`aio-app-dev`, `search-commerce-docs`)
   over guessing App Builder patterns.
5. **Deploy and verify.** Deploy with `aio app deploy` from the app directory
   (or the extensibility tooling's deploy tool), then hit the action URL
   (`aio app get-url`) before reporting success.

## Rules

- Never write code that calls an Adobe API before step 3 has succeeded — the
  action will fail at runtime with an auth error that looks like a code bug.
- `add_console_apis` changes cloud state; always confirm the exact service
  code(s) with the user first.
- No secrets in the app repo; runtime credentials live in the gitignored `.env`.
