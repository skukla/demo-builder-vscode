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

**One guard for those who press Change:** in the repository and App Builder
pickers, anything another project on this machine already uses is tagged
**"Used by Justrite"**. Choosing it says what follows in plain words: "Both demos
will share it. Changes to one show in the other, and deleting either can remove
it for both."

Final Review ends with one sentence: "Creates a new repository and a new Adobe
project. Nothing in Justrite changes."

## What was considered and left out

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
   `componentInstances['eds-storefront'].metadata.githubRepo`, workspace from
   `adobe.workspace`. Tag the matching rows in both pickers.
4. The Final Review sentence.
5. Same treatment for Copy from existing, which takes the same path.

Tests: the import seed carries no Adobe project/workspace; each picker tags a row
used by a local project; a copy's defaults never equal the source's.
