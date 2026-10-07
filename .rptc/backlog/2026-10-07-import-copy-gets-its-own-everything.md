---
id: PL-56h
kind: feature
area: platform
parent: PL-56
needs: []
value: med
status: backlog
---

# An imported or copied project gets its own storefront and its own Adobe project, already named

## What happened

RC testing, 2026-10-06, Import from file with Justrite's own export:

- **Storefront.** The repository picker opened empty. The SC chose the only
  sensible-looking entry, `kukla-justrite`, which is Justrite's own repository,
  and nothing said that another project on this machine publishes there. The copy
  would have shared Justrite's storefront.
- **Integrations.** "Deploys to: Not set · Set up". The export carries Justrite's
  App Builder project and the wizard seeds it (`initializeAdobeContextFromImport`),
  but something clears it before this screen, so the safe outcome is currently an
  accident. Had it survived, the copy's ERP would have deployed into Justrite's
  workspace and replaced Justrite's.

Both choices ask the SC to understand GitHub repositories and App Builder
workspaces, and to know which ones another project is already using. They should
not have to.

## The simple version

**An import or a copy is always a new demo.** The wizard does not ask what the SC
intends; it fills in new resources and says so in one line each:

> A new GitHub repository, **kukla-justrite-copy**. [Change]

> Your integrations get their own Adobe project, **"Justrite Copy"** (new). [Change]

Most SCs click Continue. Nothing about repositories or workspaces needs explaining.

**Labels for those who press Change.** Two things belong to one demo and must
not be shared by accident: the storefront's GitHub repository, and the Adobe
project its integrations deploy into. In both pickers, every entry another project
on this machine already uses carries a label, whichever project that is:

> kukla-justrite — *Used by Justrite*

Picking a labelled entry warns in one sentence: "Justrite already uses this. Both
demos would share it, so changes to one appear in the other." Unused entries carry
no label.

| What | Safe to share? | Labelled? |
|---|---|---|
| Storefront repository | No: each demo publishes its own site from it | Yes |
| Integration's source code | Yes: downloaded read-only, like a template | No |
| Integration's Adobe project | No: deploying replaces the other demo's integration | Yes |

Only the storefront creates a GitHub repository per project (`githubRepoOperations`,
`storefrontSetupPhase1`); an integration clones a shared source and never writes
back, so there is no integration repository to label.

Final Review ends with one sentence: "Creates a new repository and a new Adobe
project. Nothing in Justrite changes."

## What was considered and left out

**Telling the SC which repository the original used.** Rejected: they do not need
it to build the copy, and naming it invites picking it, which is what happened in
the test above. The wizard's "Import Project" title is context enough.

**"Make a copy" vs "Pick up where it left off" as a question at the start.**
Rejected as more than an SC needs. Restoring a project on a new laptop is rare,
and it is still possible through Change: pick the old repository and project.

**Reusing the file's Adobe project automatically when no local project uses it.**
Unsafe: every SC signs in to the same org, so a colleague's file names the
COLLEAGUE's App Builder project, in an org the receiver can reach. "Nobody on this
machine uses it" cannot tell a restore from someone else's demo.

## Work

1. Find what clears the seeded `adobeProject` and `adobeWorkspace` on import, then
   stop seeding them from the file at all (`initializeAdobeContextFromImport`). The
   file keeps them as provenance only, as it already does for the storefront
   (`edsConfig: undefined`, PL-56d).
2. Pre-fill "create new" for the repository (`<github-user>-<project-name>`) and for
   the App Builder project (`<project title>`), shown as one line with Change.
3. A "used by" lookup over local projects: repository from
   `componentInstances['eds-storefront'].metadata.githubRepo`, Adobe project from
   `adobe.projectId`. Label the matching rows in the repository picker and the
   App Builder project picker, and warn in one sentence when one is picked.
4. The Final Review sentence.
5. Same treatment for Copy from existing, which takes the same path.

Tests: the import seed carries no Adobe project/workspace; each picker labels a row
used by a local project; a copy's defaults never equal the source's.

## Shipped so far

- 2026-10-06  PL-56h: label shared repos and Adobe projects; integrations' source needs none (`1b03bfc54`)
- 2026-10-06  File PL-56h: an import/copy gets its own storefront and Adobe project (`92d318d14`)
