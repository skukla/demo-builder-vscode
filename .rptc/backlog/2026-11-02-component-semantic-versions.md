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
- 2026-11-02  feat(updates): a collaborator on early access can try a component's alpha (`87865325f`)
- 2026-11-02  feat(updates): meshes and App Builder components ship by release (`7a136fb7c`)
- 2026-11-02  docs(updates): state that components ship by release (`5aa0376d5`)
- 2026-11-02  fix(updates): a mesh folder with no git history is cloned again at its release (`8247f13be`)
- 2026-11-02  refactor(updates): a plain guard in the update check's candidates (`dd6d5eed4`)
- 2026-11-02  fix(updates): a Headless update moves the clone, and keeps the SC's edits (`677d6a1e2`)
- 2026-11-02  fix(eds): a failed patches lookup never hands a storefront an unreleased commit (`453794065`)
- 2026-11-02  feat(eds): a storefront has a version, and a release of fixes alone reaches it (`701a938a1`)
- 2026-11-02  feat(releases): libraries, brand assets and buildright ship by release, with one lookup (`3e0c0dd9c`)
- 2026-11-02  refactor(updates): one early-access rule, and the archive helper is gone (`0e8fd6432`)
- 2026-11-02  fix(mesh): a mesh deploy records the commit it shipped (`cd17f8ad3`)
- 2026-11-02  fix(updates): removing a component drops its version record, and the live test results (`d8705f51d`)
- 2026-11-02  feat(releases): every component is on the beta track until the extension reaches 1.x (`b1883f1c8`)
- 2026-11-02  feat(releases): the release process is a convention, checked across every repository (`c48221ada`)
