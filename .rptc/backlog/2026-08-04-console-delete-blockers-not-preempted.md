# Console teardown pre-empts one delete blocker of three

**Filed:** 2026-08-04
**Origin:** App Builder deletion/management audit (see "Audit findings" below).
**Severity:** Medium — the failure is an opaque Console 409 that does not name its
cause, which is exactly the failure `consoleProjectTeardown.ts` exists to prevent.
**Present in:** `consoleProjectTeardown.ts` as written.

## The gap

`consoleProjectTeardown.ts` deletes a Developer Console project after clearing the
event registrations and third-party event providers that would otherwise make the
delete fail with an opaque 409. Its docstring records the discipline:

> Collect-don't-throw per entity; abort BEFORE the project delete when any entity
> failed (pre-emptive — the Console 409 never names the blocker).

Adobe documents **three** conditions that block a project delete. Teardown handles one.

| Blocker | Pre-empted today |
|---|---|
| Event registrations / 3rd-party providers | Yes |
| An App Builder app submitted for approval (Pending or Published) | **No** |
| A workspace whose Runtime namespace exposes a shared package | **No** |

The published-app rule and the "revoke, then delete" remedy are stated in the
[Console projects guide](https://developer.adobe.com/developer-console/docs/guides/projects/):

> If an App Builder Project has been submitted for approval (status: Pending or
> Published), then that Project cannot be deleted. However, you can always revoke a
> published app and then delete the Project.

Both unhandled blockers fail the same way the handled one did: Console refuses, the
error does not say why, and the user sees a teardown that stopped for no stated reason.

## Fix shape

Extend the existing pre-flight rather than adding a second mechanism. Teardown already
aborts before the delete when an entity fails; add the two checks to that same gate and
name the blocker in the abort message, including the remedy for the published case
("revoke the published app in Exchange, then retry").

## Likelihood in practice

Low for demo projects as we build them. Our integrations are headless catalog apps that
are never submitted for approval, and each deploys into its own private OpenWhisk package
(`owPackageName.ts`) rather than a shared one. This is a robustness fix for the case where
a user's org has done either thing by hand — not a live bug anyone has hit.

## Audit findings that produced this (do not re-derive)

Verified 2026-08-04 against the local `aio` CLI and public Adobe docs.

- **`aio app undeploy` removes everything `aio app deploy` created** — actions, web
  assets, events, extension registrations — and `--unpublish` **defaults to true**, so an
  undeploy also unpublishes extension points from Exchange. `--force-unpublish` goes
  further and deletes all extension points.
- **Per-action undeploy is not expressible.** The only granularity is by component class
  (`--actions`, `--web-assets`, `--events`) or by extension (`-e`). There is no per-action
  flag. Any UI affording "undeploy this one action" would have nothing behind it.
- **`removeAppComponent` is already correct** — bare `aio app undeploy` under
  `withOrgContext`, best-effort, warning-not-throwing. No change needed.
- **Deleting a Console project or workspace cleans up its cloud resources automatically**,
  including the Runtime namespace and the CDN-served web assets. There is no pre-cleanup
  the extension must perform before deleting a project. The public docs describe this only
  as removing "all entities contained within the Project"; the ordered teardown is
  documented in Adobe-internal sources, which stay out of this public repo.
- **Stale search results warning:** community and support threads from 2021–2022 state
  that projects containing Runtime cannot be deleted at all. That limitation is gone. A
  future session searching this topic will surface those threads first — do not trust them.
