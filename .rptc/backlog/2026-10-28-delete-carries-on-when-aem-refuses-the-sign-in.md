---
id: EDS-69
kind: fix
area: eds
needs: []
value: high
status: active
---

# A storefront delete carries on when AEM refuses the sign-in

Filed 2026-10-28.

## What happened

Deleting scratch-1022 unpublished 142 pages, then at 20:48:07 every AEM call went 403: a
forced Adobe sign-in had just cancelled the DA.live token (PL-84). The product-page step
reported "30 of 49 removed" and the delete carried on. A second cleanup run got 403 on the
listing of published pages ("Helix refused the status job's results (HTTP 403)"). The
teardown read that as publishState `unknown` and went on deleting the DA.live content and
config.

EDS-65 (`d3ebc9945`) made `still-live` stop the teardown, and left `unknown` carrying on on
purpose: it is also the answer for a site whose content is already gone and whose home page
answers 404. A refused sign-in was landing in that bucket.

## The fix

A 401/403 from AEM is "sign-in refused", not "can't tell":

- the listing of what is published throws a `DaLiveAuthError` for 401/403
  (`helixPublishedPaths.ts`), and the unpublish answers publishState `sign-in-refused`;
- the product-page removal flags `signInRefused` when its listing is refused that way or
  any live copy could not be removed (every failed removal is a 401/403:
  `deleteResource` in `helixPageDeletion.ts` answers `success:false` for those alone);
- the teardown stops on either, where `still-live` stops: before the Admin API key, the
  DA.live content and the site config, and every door keeps the repository and the
  project. It says: "AEM refused the DA.live sign-in, so nothing else was deleted. Sign in
  to DA.live again, then delete again."

`unknown` stays for genuine can't-tell. A failed live removal on the authored pages
(`liveFailed`) still reads `still-live`, which already stopped.

## Shipped so far
- 2026-10-28  fix(eds): a storefront delete removes the site's code, and stops when DA.live is signed out (`a2072e04f`)
