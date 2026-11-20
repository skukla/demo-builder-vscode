---
id: EDS-70
kind: question
area: eds
needs: []
value: med
status: backlog
---

# Could one Adobe credential replace our separate DA.live and publishing sign-ins?

Filed 2026-11-03. Not needed for beta.153.

The Adobe Developer Console now lists an **Edge Delivery Services** card that can be
added to a workspace. An SC's storefront work currently depends on separate DA.live
and publishing sign-ins, and those sign-ins are a repeated source of failed steps.

**The question:** does that card give one server-to-server credential (a credential
that belongs to the workspace rather than to a person) enough access for content
reads and writes, preview and publish? If so, could Demo Builder use it instead of
the SC's own tokens?

**What is not known yet:**

- Whether the card is generally available, or only to some organizations.
- Whether public documentation describes it. Nothing here has checked yet.
- What setup each site would need so the credential is allowed in.
- Whether writes made by a credential show up differently from writes by a person,
  which would matter for authoring history in a demo.

**Recommendation:** read the public docs once the card is generally available, then
try it on one test site. Change nothing until that test passes. If an SC would still
need their own sign-in for authoring in the browser, the gain may be small.
