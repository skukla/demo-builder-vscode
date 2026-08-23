# EDS drift fixtures

Committed live-response SHAPES for `npm run eds:drift` (`scripts/edsDrift.js`).
Bootstrap or re-baseline with `npm run eds:drift -- --capture` against a real
storefront you own, then **review before committing** — the fixtures describe
your own site's responses and this repository is PUBLIC: no tokens, no emails
you would not publish (the roster fixture carries admin emails — redact to
placeholders of the same shape), no internal endpoints.

A missing fixture makes its check FAIL loudly (never "no drift") — the
checker refuses to manufacture confidence from an empty baseline.
