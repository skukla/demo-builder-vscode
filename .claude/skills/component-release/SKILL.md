---
name: component-release
description: Publish a version of a component in a repository the builder owns — a mesh, ERP, integration, storefront, block library or the inspector. A push to these repositories reaches no SC; a release does. Use when asked to release a component, cut a version of one, or try one on early access. The extension itself uses `cut-release`.
---

# Release a component

The extension's rule, applied to everything the builder owns (owner, 2026-11-02): **a push reaches no SC.
A published release does.** `RELEASED_REPOS` (`src/core/releases/releasedRepos.ts`) lists them, and a test
checks that list against the catalogs.

## Before anything: a beta is user-facing distribution

**Every component is on the extension's beta track until the extension reaches 1.x (owner, 2026-11-02)**, so the step
refuses a normal version. Every SC gets a component's betas, on the stable channel as well as the beta channel, so publish
one only when the owner has said to, for that release. An `-alpha` reaches only a collaborator on the early-access
channel, which is how a release is tried. Say which you are about to publish.

## Do it

```bash
R=.claude/skills/component-release/release.mjs

node $R ../demo-erp --version 1.0.0-beta.1 --notes /tmp/notes.md     # dry run: every check, publishes nothing
node $R ../demo-erp --version 1.0.0-beta.1 --notes /tmp/notes.md --publish  # with the owner's go
```

Bump `package.json` and push first: a beta must match it. An alpha need not, because it is
a rehearsal that changes nothing in the repository.

It refuses, and says why, for each of these:

- a normal version, until the extension reaches 1.x
- a version no channel accepts, or one not above the newest tag
- `package.json` disagreeing with the version
- empty notes
- uncommitted changes, or a HEAD that is not the pushed tip of the default branch
- the `checks` job missing, or not passed, on this commit. Every owned repository has a CI job with that name, so a deploy or a skipped job can never pass for it
- the ERP pair disagreeing on `contract/erp-contract.json`

`skukla/eds-demo-patches` is refused too: `lkg-gate.yml` publishes its release itself when its daily gate passes.

## Every repository carries

- A CI job named `checks`, on every push and pull request, that validates the `package.json` version and runs the repository's own checks
- A `RELEASING.md` saying a push reaches no SC, and how a release happens

`npm run components:ci` checks all of that across every repository, daily and in the sweep. Run it after changing a repository's CI.

## The ERP pair

The system goes first, as the updater updates it first. Releasing `demo-erp` asks whether
`commerce-erp-integration`'s `main` is on the same contract; releasing the integration asks whether a released
`demo-erp` already is. So a contract change lands on both `main` branches, then `demo-erp` is released, then the integration.
An alpha of the integration compares with `demo-erp`'s `main`: it is a rehearsal, and no SC gets either.

## Trying a release before SCs get it

1. Publish `-alpha.N` with the owner's go.
2. A dev build on the early-access channel offers it: `demoBuilder.updateChannel` set to `early-access`, signed in to GitHub as a collaborator.
3. Check it installs and updates. Record the result in `.rptc/plans/component-semantic-versions/validation.md`.
4. Delete the release and its tag: `gh release delete vX --repo R --cleanup-tag --yes`.

## Verify

`gh release view vX --repo R` shows it, and `check_integration_updates` or `apply_updates` offers it on a project behind it.

_If this skill was wrong or incomplete, fix it before closing the task._
