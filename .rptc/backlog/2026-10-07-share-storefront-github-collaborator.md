---
id: EDS-32
kind: question
area: eds
needs: []
value: med
status: open
---

# Sharing a storefront: should Site access also make someone a GitHub collaborator?

Filed 2026-10-07 from the owner, reviewing the Site access screen: it is a "give access"
screen (you re-give access to yourself, or you give it to someone else), and if EDS-22's real
goal is sharing a storefront, the third kind of access a colleague may need is the GitHub
repository. "A larger lift."

## What a storefront share involves today

| Access | Where it lives | Who grants it | In Site access |
|---|---|---|---|
| Configuration admin | AEM Configuration Service, keyed by the GitHub repo | an existing admin; for yourself, the AEM Code Sync GitHub App install | yes |
| Read the authored content | DA.live org `permissions` sheet (EDS-22) | the sharer | yes |
| The code | the GitHub repository | the repo owner | no |

"Add a demo by link" copies the code from the repository, so a PUBLIC repo needs no grant
for copying. A collaborator grant matters when the repo is private, or when the colleague
should change the code in place rather than copy it. Which of those is the goal decides
whether this is worth building.

## What was checked (2026-10-07, code only, no API call made)

- The GitHub sign-in already asks for `repo` (`GITHUB_SCOPES`, `src/features/eds/services/types.ts`),
  which covers adding and removing collaborators on a repository the SC administers. No
  new sign-in scope.
- No collaborator code exists today (`grep collaborator src/` finds only the ADR-015 sense of
  the word).

## What would be different from the other two kinds

These are claims from GitHub's REST documentation, not measured here:

- It takes a GitHub USERNAME, not an email. Looking a user up by email only works when
  their email is public, so the screen would ask for a username.
- It sends an INVITATION the colleague must accept; until then they have no access. The list
  would need a "pending" state.
- For a repository under an organization, the org's policy may forbid outside collaborators.
- Undo exists (remove the collaborator, or cancel the invitation), so property 1 holds.

## Recommendation

Answer the goal question first: copying (public repo, nothing to grant) or co-editing (a
collaborator grant, write permission). If co-editing, build it as a third tab on Site access
with its own add dialog asking for a GitHub username and the permission, plus an agent tool
pair like `set_content_reader`.

## Answered 2026-10-07 (owner)

The goal is COPYING into the colleague's own Demo Builder project, not co-editing: they need
the content (DA.live read, EDS-22) to get every block and page, and the code (the repo, with its
blocks, theme and look) to add the storefront as a brand template.

Read against the code the same day: "Add a demo by link" already is that brand template
(`addSharedDemoHandler.ts` remembers the row as a Welcome card; project creation copies the
source repo into the colleague's own, `createRepoFromSource` in `edsGitHubHandlers.ts`). Demo
Builder creates storefront repos PUBLIC by default (`isPrivate ?? false`), so for those the code
needs no grant. A GitHub grant is needed only for a PRIVATE source repo, and then READ
(`pull`), not write. So the collaborator option belongs in the give-access flow only when the
repository is private.
