# Step 8: Outside repos at runtime; plugins installed once

**Outside repos.** `integrationRepoReader.nodeMajorOf` takes the first number in a range, so
`>=18` installs Node 18. It returns the RANGE instead, and the add door resolves it: the shared
Node if the range accepts it, else a Node already in the folder that does, else the lowest LTS
that does (`fnm list-remote --lts` + semver). The chosen major is recorded on the project's
App Builder component, the same record cleanup reads (step 11).

**Plugins once.** `aio plugins:install` writes to `~/.local/share/@adobe/aio-cli`, shared by every
`aio` on the machine (verified 2026-10-07). The per-Node plugin loop in `installHandler`
(`installPlugins` over `toolVersions`) becomes one install; the plugin check reads once.

**Tests:** `>=18` resolves to the shared Node; `^22` with a shared 24 installs 22; an
unsatisfiable range is refused at the add, with the range named; the plugin installs once
whatever the number of Nodes.
