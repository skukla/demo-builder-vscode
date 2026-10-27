---
id: EDS-66
kind: fix
area: eds
needs: []
value: med
status: active
---

# A new storefront's template code reaches the site, or setup says it did not

Filed 2026-10-27, from a colleague's storefront (mrajkovich/bodea, beta.149).

## What happened

The site rendered as raw text: no styles, no scripts. Every file that exists only in the
repository's first commit (the template's: `styles/styles.css`, `scripts/aem.js`,
`scripts/commerce.js`, `blocks/hero/hero.js`, `favicon.ico`) answered 404 on aem.live and
aem.page. Every file Demo Builder changed in a later commit was served. Measured file by
file the same day.

Her Debug Logs show the setup's code publish answered at once:

    09:38:01.630  [Helix] Previewing code: https://admin.hlx.page/code/mrajkovich/bodea/main/*
    09:38:02.692  [Helix] Successfully previewed code: /*
    09:38:02.692  [Storefront Setup] Code published to CDN

AEM's answer means the publish was ACCEPTED; it runs afterwards, and here it did not bring
the template's files. Nothing looked. Pressing Republish on the dashboard (which publishes
`/*` again) fixed the site at 10:28, fifty minutes later.

Why AEM's publish missed them is not known from here: AEM's job records need the site's
admin key. The repository was three minutes old. Unverified.

## Why the release's check did not cover it

`confirmStorefrontCodeServed` (`codeServed.ts`, 2026-10-23) already compares what the site
serves with the repository after creation and reset, and publishes again what differs. But
on creation it checks only the files committed AFTER the template's commit, so the
template's own files, which are the whole site, were never looked at.

## The fix

Also look at two files every storefront's pages load (`scripts/aem.js`,
`styles/styles.css`). When the site does not serve them as committed, the template's code
is missing as a whole, so publish all the code again (`/*`, as Republish does), not file by
file, a bounded number of times. What is still missing goes into the same sentence the SC
already sees, which says to press Republish. Creation and reset both run it.
