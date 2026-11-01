# Each company's own catalog and prices on ACO: one integration, parts that come off

Owner, 2026-11-01: "It would be cool to combine it into the same thing and then just remove the pieces
that get replaced when it GAs." Item: PL-87. Why it exists:
`.rptc/research/aco-support/customer-pricing.md`.

## The shape

One library integration, ticked by default when a project has ACO, a B2B package, a store with shared
catalogs and a backend that is not already doing this. The SC can untick it. It deploys to their
workspace, so it stays a visible choice, and removing it undoes all of it.

| Part | What it does | When Adobe's connector is on |
|---|---|---|
| **Catalog setup** | One policy, one private view and one key per shared catalog and store view. Marks each product with its shared catalogs | Not used: the connector does this |
| **Who sees what** | Answers the storefront's `company { catalogViewContext { catalogViewId accessToken } }`: reads the buyer's company, finds its view, signs a token | Not used: Commerce answers the same field |
| **Price source** | Where a buyer's price book comes from. By default, what Commerce says. Swappable for a pricing service | Kept: the connector treats Commerce as the source of prices, so this is the piece it does not replace |

The storefront is no part: Adobe's template already asks the question and sets the headers.

## Why the parts come off cleanly

Adobe's connector and this make the same objects with the same names, so a demo moved onto the connector
changes what answers, not what the storefront does.

| Thing | Value |
|---|---|
| Price book | `<website code>::<sha1(customer group id)>`, one per website and group |
| Private view | One per shared catalog and store view, with one price book |
| Token | RS256, `exp` required, one hour |
| Headers | `AC-View-Id`, `AC-Price-Book-ID`, `AC-Catalog-View-Access-Token` |

Where sources disagree, follow the storefront code we ship, then what a live call answers.

## A custom pricing service

It writes its own price books straight to ACO under ids that do not collide with the connector's, the
price source part answers with them, and the cart gets its price from the webhook the ERP integration
already uses. Commerce still prices checkout, so this shows browse prices past what customer groups
allow. Adobe's own version of that is not due soon. A private view takes one price book, and licensing
counts views times price books, so a demo at scale uses few views and many books.

## Proved, and what is left

Proved on real ACO and ACCS, 2026-11-01 (`customer-pricing.md`): ACCS answers `catalogViewContext` with
null, a Mesh can answer it instead, and a private view with a policy and a signed token behaves as the
connector's would. A project without a mesh needs this one added, and it must forward `Authorization`.

Worth knowing for a demo: a policy filters search and listings, not a read by SKU.

Left to decide or prove:

1. **Whether November's ACCS release carries shared catalogs.** If it does, build only the price source.
2. Where the Mesh keeps its signing key. A Mesh can sign the token itself, and a private view works in a browser through Adobe's template (`.rptc/research/aco-support/customer-pricing.md`), so the part that answers may need no separate action.

## Not started

Nothing here is built. The ACO tools (`get_aco_status`, `run_aco_query`, `run_aco_admin`,
`write_aco_admin`, `write_aco_rows`, `create_aco_access_key`, `delete_aco_access_key`) are what it would be
built and checked with.
