---
id: PL-89
kind: feature
area: platform
needs: []
value: high
status: active
---

# Every component ships as a semantic-version release

Owner, 2026-11-02: "Every component, including storefronts that we offer, should move to the same consistent, semantic
versioning approach." Then: "We can't release .153 until this release process per component is implemented properly and tested and validated on every
repo." Scope: "repositories that the builder directly owns." And: "anytime code is pushed it should follow the same release process.
Code doesn't make it out to SC's for the extension until we release it, right? The components should follow the same pattern."

**This blocks beta.153.**

Merging to `main` reaches SCs today for meshes (on develop), the ERP pair, the shell and block libraries, with no version,
notes or hold. It came to light when merging the two ERP repositories.

Plan: `.rptc/plans/component-semantic-versions/overview.md`. It replaces PL-88's branch model, and it stops the updater row described below.

Order matters. The release updater looks up every component instance with a `repoUrl`, and applying its row deletes the
clone and deploys nothing. No App Builder repository gets a first release until that stops and the extension release
carrying the fix is out.

## Shipped so far

- 2026-11-02  fix(updates): one reader of releases, and no release row a component cannot apply (`a2ab6be57`)
- 2026-11-02  docs(plans): every owned component ships as a semantic-version release (`4782e0645`)
