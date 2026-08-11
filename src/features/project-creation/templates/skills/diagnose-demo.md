---
name: diagnose-demo
description: Routes a broken-demo symptom to the check that answers it. Use when something is wrong and you do not yet know why — empty product pages, an empty catalog, the site serving old content, a mesh behaving unexpectedly, or a project that will not start. Read this BEFORE editing anything.
---

# Diagnose a Demo

Every other skill here tells you how to DO something. This one tells you how to LOOK,
so you find the cause instead of changing things until the symptom moves.

**Start from the symptom, not the code.** The table routes you to the check that
distinguishes causes; the sections below say how to read each answer.

## Symptom → first check

| Symptom | Check first | Why this one |
|---|---|---|
| Product page renders empty or 404s | `get_store_structure` | The project can point at a website or store view that has no products — or does not exist |
| Catalog is empty everywhere | `get_store_structure`, then the Commerce admin | A scope that resolves is not necessarily a scope with products in it |
| Site serves old content after an edit | `sync_storefront` | Pushing is not publishing; see "Pushed is not published" |
| Mesh behaves unexpectedly | `check_mesh` | Reports both deployed AND up-to-date — they differ |
| A setting change had no effect | `get_project` | Compare what is saved against what you expected to save |
| Project will not start | Debug Logs channel | The structured error is in the log, not in any tool result |
| Agent tools missing or failing | `verify_ai_setup` | Reports AI context, MCP config and skills health together |

## Reading `get_store_structure`

It returns the websites / store groups / store views the backend actually has, plus a
`resolution` verdict for each code the project is configured for:

| Verdict | Meaning | What to do |
|---|---|---|
| `ok` | the configured code exists | Scope is not your problem — keep going down the table |
| `missing` | the project points at something that is not there | Fix the code in Configure → Business Structure, then republish |
| `not-configured` | no code saved at that level | Usually fine; only some setups need all three |

**`ok` does not mean "has products."** It means the scope exists. A brand-new website
resolves `ok` and serves an empty catalog. If every code is `ok` and pages are still
empty, look at the catalog in the Commerce admin (`get_project_urls` gives you the link).

## Pushed is not published

For EDS projects these are two different things, and the gap is the most common false
"my change did not work":

1. **Push** — git commit + push. A PostToolUse hook does this automatically for Write/Edit
   inside the storefront directory. It does NOT publish.
2. **Publish** — Helix preview + publish. Only `sync_storefront` (when Helix credentials
   are available) or `sync_content` does this.

If a change is in GitHub but not on the live site, you are between the two. Call
`sync_storefront`; it is idempotent.

## The mesh `.env` ordering trap

`deploy_mesh` deploys whatever `.env` is on disk. It does **not** regenerate it. Only a
**Configure save** regenerates `.env` from the project's settings.

So after changing Commerce settings the correct order is:

1. Configure → save (regenerates `.env`)
2. `deploy_mesh`

Deploying first redeploys the old configuration and reports success.

## When a tool answer is not enough

- **Debug Logs** — the "Demo Builder: Debug Logs" output channel carries the structured
  stdout/stderr of every command the extension runs. When a tool returns a vague failure,
  the real error is here. Ask the user to paste it.
- **Diagnostics** — the "Demo Builder: Diagnostics" command runs the full local probe set
  (tools, Adobe CLI auth, MCP socket, GitHub↔AEM credential, storefront delivery) and has
  a Copy Report action. Ask for it when you need the whole picture at once rather than one
  answer.

Both are things only the user can run. Ask, rather than guessing past a missing answer.

## Rules

- **One check at a time, and read it before the next.** Changing several things and
  re-testing tells you nothing about which mattered.
- **Do not edit to test a theory.** The reads above are free and reversible; edits are not.
- **Report what the check said**, not what you expect it to mean. "`websiteCode` is
  `missing`" is useful; "the storefront is broken" is not.
- **You cannot see the rendered page.** If the answer depends on what something looks
  like, ask the user for a screenshot rather than asserting it.
