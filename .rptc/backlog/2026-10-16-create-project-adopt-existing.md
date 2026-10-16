---
id: AI-74
kind: feature
area: ai
needs: []
value: med
status: active
---

# An agent can rebuild a project on a repository and site that already exist

Filed 2026-10-16. The owner deleted the patch-canary-b2b project, kept its GitHub
repository and DA.live site, and asked for it to be recreated by an agent.

`create_project` could not. Its storefront step always ran with `repoMode: 'new'`, so
GitHub refused the existing name ("Repository name already exists",
`githubRepoLifecycle.ts`) and the run stopped before touching anything. The wizard has
the choice ("use existing" repository and site); the agent door never passed it. Its
failure hints also promised that "already-created resources (the repo) are skipped on
retry", which nothing implemented: every retry asked for a new repository again.

## What was built

- `adoptExisting: true` on `create_project`: the storefront step gets
  `repoMode: 'existing'`, `existingRepo: githubOwner/repoName` and the named site as
  `selectedSite`, the wizard's existing choice for both. No reset to the template, and a
  selected site with no reset keeps its content.
- Both failure hints now say to retry with `adoptExisting:true`.
- Typing the storefront payload to its declared type showed the agent was also sending
  `accsEndpoint`, which nothing in storefront setup reads (creation reads `accsHost`).
  Removed; four tests that pinned the dead field now assert `accsHost`.
