# Step 0: Live checks on Node 24 (owner-gated)

Two facts the decisions rest on, measured before any code moves. Both write to the cloud, so
each runs only with the owner's OK, on a scratch project.

1. **A mesh deploy on Node 24.** On a scratch project with a mesh: make sure `aio` and the
   `api-mesh` plugin exist under the Node `fnm exec --using=24` picks (24.21.0 on the owner's
   machine has neither, measured 2026-10-07), then run the deploy with that Node, e.g.
   `fnm exec --using=24 aio api-mesh update ...` through the extension's deploy path with the
   version overridden. Pass: the deploy succeeds and `aio api-mesh status` reads it back.
2. **A data ingestion run on Node 24.** `commerce-demo-ingestion` (`engines >=18`) with Node 24
   against a scratch store. Pass: it runs to the end and its data is readable.

If either fails, stop and bring it back: decision 1 or 2 changes (a declared exception), the rest
of the plan does not.

Record both results on PR-1a.
