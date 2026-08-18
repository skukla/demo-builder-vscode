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
| Product page renders empty or 404s (EDS) | `get_site_access` | **Start here, not with scope.** A refused Configuration Service write leaves a storefront that builds, pushes and browses fine — and cannot serve a single product page. From outside it looks exactly like an empty catalog |
| …site config is healthy, pages still empty | `get_store_structure` | Now scope is worth checking: the project can point at a website or store view that has no products, or does not exist |
| Catalog is empty everywhere | `get_store_structure`, then "Reading an empty catalog" below | A scope that resolves is not necessarily a scope with products in it — and an import that SUCCEEDED can still read as empty |
| Site serves old content after an edit | `sync_storefront` | Pushing is not publishing; see "Pushed is not published" |
| Your change is not on the site — did work get lost? | `git log` in the storefront | Git is the record, not the rendered page. See "Is your work still there?" — check it BEFORE concluding anything, and before re-applying anything |
| Mesh behaves unexpectedly | `check_mesh` | Reports both deployed AND up-to-date — they differ |
| A setting change had no effect | `get_project` | Compare what is saved against what you expected to save |
| A whole FEATURE seems absent | `get_settings` | Two keys are functional gates rather than preferences — the Data Installer surface does not exist without `dataInstaller.enabled` + `apiBaseUrl`. "Off" and "broken" look identical until you look |
| Setup fails before anything runs | `check_prerequisites` | Needs a stack id. Reports per tool whether it is installed and at what version |
| EDS publishing silently fails | `check_github_app` | The AEM Code Sync app not being installed on the repo is silent everywhere else |
| A repo will not serve a storefront | `check_repo_readiness` | Returns a verdict, or `undetermined` WITH a reason — which is a different answer from "not ready" |
| Project will not start | Debug Logs channel | The structured error is in the log, not in any tool result |
| Agent tools missing or failing | `verify_ai_setup` | Reports AI context, MCP config and skills health together |
| You want the whole picture at once | `get_project_status` | One call covering the project's overall health, rather than a symptom-led walk down this table |

## Reading `get_site_access` — the empty-product-page check

This is the one that used to be missing, and its absence sent people to the Commerce
admin to look for products that were there all along.

An EDS storefront needs a site configuration registered with the Configuration Service.
That write is refused when the caller holds no admin role on the site. When it is
refused, the storefront still builds, still pushes, still browses — and serves no
product detail page, because the routing rule that resolves `/products/...` was never
written.

| `status` | Meaning | What to do |
|---|---|---|
| `ok` | the config is readable and this identity can manage it | Site config is not your problem — go to `get_store_structure` |
| `not_authorized` | this identity holds no admin role on the site | Someone in `orgAdmins` / `siteAdmins` must grant it. Report those addresses to the user; they are why the tool returns them |
| `no_credential` | not signed in to DA.live | `connect_dalive`, then re-check. Distinct from `not_authorized` on purpose — one is fixed by signing in, the other cannot be fixed by this user at all |
| `no_site` | the project has no EDS storefront | The symptom is something else |

Once access is in place, `repair_site_configuration` re-runs the write that failed. Two
things to know before calling it:

- It is confirm-gated because it re-mints the site's publish key and can drop admin
  grants nothing in the app can restore (reported as `lostGrants`).
- **It does not publish.** Registration writes a routing rule; the live site keeps
  serving what it last published until you call `republish`. The result says
  `nextStep: "republish"` for exactly this reason — stopping at `repaired` and
  reporting the storefront fixed is the mistake this field exists to prevent.

## Reading `get_store_structure`

It returns the websites / store groups / store views the backend actually has, plus a
`resolution` verdict for each code the project is configured for:

| Verdict | Meaning | What to do |
|---|---|---|
| `ok` | the configured code exists | Scope is not your problem — keep going down the table |
| `missing` | the project points at something that is not there | Fix the code in Configure → Business Structure, then republish |
| `not-configured` | no code saved at that level | Usually fine; only some setups need all three |

**`ok` does not mean "has products."** It means the scope exists. A brand-new website
resolves `ok` and serves an empty catalog. If every code is `ok`, the site config is
healthy, and pages are still empty, look at the catalog in the Commerce admin
(`get_project_urls` gives you the link).

That ordering matters. An earlier version of this skill sent you straight here from the
symptom, so the common case — a refused site-config write — was diagnosed as "your
catalog is empty" while the catalog was fine.

## Reading an empty catalog

An import that reported success can still show you nothing, and the reason is not
that the import lied.

**`GET /V1/categories` returns only the DEFAULT store group's subtree.** On an
instance with several roots — Default, plus one per brand — a pack's categories
land under their own root and are invisible through that endpoint. The per-type
`success` is telling the truth; the read is what is narrow. Use
`GET /V1/categories/list`, the flat search, to see what is actually there.

**A root category is assigned by hand, in the Admin, after the import.** The
service creates the category tree; it does not attach it to a store. Until
someone does, the storefront has a catalog it cannot see. This is the step most
often missing when "the import worked and the site is empty".

So, in order:

1. `get_store_structure` — is the configured scope real?
2. If scope is fine, check the flat category list rather than the tree.
3. If the categories exist but the store shows none, the root category has not
   been assigned. That is an Admin step; say so rather than re-importing.

Re-importing does not fix this and costs minutes. It is the wrong instinct here
precisely because the import was never the problem.

## Is your work still there?

You edited a file, the site does not show it, and the question that follows is whether
something ate your change. **Run `git log` in the storefront before you answer it.**

```
git -C <storefront> log --oneline -20 -- <the file you changed>
```

- **Your commit is in the log** → your work is safe. The site is behind, not wrong.
  Publishing reaches the CDN edge on a delay, and that delay is not data loss. Wait,
  reload, and check again. Do not re-apply the change; you will only commit it twice.
- **Your commit is not in the log** → it was never committed. Look at `git status`
  first; the edit is probably still sitting in the working tree.

Nothing in this extension force-pushes or rewrites a storefront branch. If you suspect
history was rewritten, that is a claim git can settle in one command — compare the
before and after of each push rather than inferring it from what the site serves:

```
gh api "/repos/{owner}/{repo}/compare/{before}...{head}" --jq .status
```

`ahead` means commits were added and none were lost. Only `behind` or `diverged` would
mean a branch was moved backwards.

This exact symptom once cost an hour and produced a bug report about force-pushing that
was entirely wrong. What had happened was CDN propagation lag. `git log` would have
ended it at the first minute.

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
