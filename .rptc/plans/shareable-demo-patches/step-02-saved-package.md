# Step 02 — A saved package stays a Demo Builder storefront

## `builtWith`, written at save time from the project's resolved storefront

```jsonc
"builtWith": {
  "package": "bodea",                                  // the shipped package id, when one
  "template": { "owner": "adobe-commerce", "repo": "boilerplate-b2b-template" },
  "lkg": "<sha the project was pinned to>",           // from lkgSource + lastSyncedCommit
  "codePatchSource": { "owner": "skukla", "repo": "eds-demo-patches", "path": "b2b", "lkgFile": "b2b/last-known-good" },
  "codePatches": ["header-nav-tools-defensive", …],
  "boilerplate": { "name": "@adobe/aem-boilerplate-commerce", "version": "6.0.0" },
  "extension": "1.4.0"
}
```

## On add and on "Start a project with it"

`storefrontFromAddedDemo` carries `codePatches`/`codePatchSource` from `builtWith` when the
template is one of ours and the ledger is reachable. Creation then runs the real patch step
instead of the dry check, in FIT mode: each patch applies where its precondition matches
exactly once, is counted "already present" where the replacement is found, and is reported
where it misses. The re-pin (`pinRepoToLkg`) runs only when every canonical file it would
replace hashes equal to the recorded pin; otherwise it is skipped with one line on the
completion card ("Kept your edits to N boilerplate files; fixes applied where they fit").
Reset behaves the same, so a saved brand keeps receiving fixes without ever losing an edit.

## Why not simply pin

A shipped brand's reset replaces canonical files wholesale because a shipped brand is not
hand-edited. A saved package may be: the SC could have edited a canonical file, and a
wholesale pin would silently destroy it (the repository's second principle). The hash
compare is what makes the pin safe to keep as an option.

## Pins that move

`describeProject`/`readSharedDemoDescription` tests (version 2 read, version 1 still read),
`storefrontResolver` tests, `pinIfThinLayer`/`lkgPinHelper` tests (the hash guard),
`storefrontSetupDemo` (dry check no longer runs when the real apply does).
