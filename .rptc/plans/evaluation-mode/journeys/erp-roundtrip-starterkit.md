# ERP round-trip, starter-kit flow — journey B

Owner ruling, 2026-08-28: *"a user can decide to implement this either in the
app shell or via the starter kit. We should have two distinct journeys and
test both flows."* Journey A (`erp-roundtrip.md`) measured the shell flow.
This is the starter-kit flow: same producer goal, the other door.

## The ground fact that shapes this journey

bodea already has `commerce-integration-starter-kit` attached and DEPLOYED
(v4.0.0, since 2026-08-27). So on bodea, "implement via the starter kit" is
the EXTEND flow — a producer who has the kit and builds their ERP on top of
it (the `extend-app-builder-app` skill's exact territory). The fresh-add flow
(producer without the kit: add from catalog → build → deploy → remove) needs
a project that does not have the kit; run it there when one exists.

## Variant B1 — extend the existing kit on bodea (runnable now)

**Zero state**: the kit's pre-journey state — capture BEFORE the run:
`git -C ~/.demo-builder/projects/bodea/components/commerce-integration-starter-kit
rev-parse HEAD` + `git status --short` + the component's `status`/`version`
from the manifest. Zero = same commit, clean tree (or byte-identical mods),
same deployed state.

**The prompt**:

> I want to build ERP-style order handling into this project using the
> Commerce integration starter kit that's already part of it — order events
> from my Commerce backend should be received and queryable through an
> endpoint an external system could call. Build it on the starter kit, deploy
> it, and show me it working. Once we've confirmed it works, undo everything
> — the starter kit and this project should end exactly as they started.

**What B1 measures that A could not**: the extend-app-builder-app skill and
the commerce-extensibility server's starter-kit rules (both sat unused in A —
the shell's embedded guidance carried that build); `redeploy_integration` as
the undo vehicle (restore files → redeploy, rather than remove); and whether
an agent can round-trip a MUTATION of pre-existing state, which is a harder
zero than add-then-remove.

**Teardown consent note**: redeploy_integration may carry the same human
consent gate as remove (verify before an unattended run) — see AI-7.

## Variant B2 — fresh add on a kit-less project (needs a host project)

The catalog's "Pre-built integration" door: add the kit, onboard, build,
deploy, remove. This is also the natural measure for AB-6 (the kit's onboard
creates event providers; teardown must delete them) — blocked on AB-6's
tooling for the eventing half, runnable without it for the rest.

## Both journeys' shared contract

Idempotency rules apply verbatim (journey measurement rule 6): the ask
contains its own undo, the result is reported in plain English, and anything
that cannot return to zero is a reversibility finding.
