---
id: AB-3
kind: fix
area: app-builder
needs: []
value: med
status: backlog
---

# Integration add must fail on install error

## Index hook

*Measured live 2026-08-27 while driving `add_integration` with the Commerce
Integration Starter Kit through the MCP surface (owner-directed test).*

The kit ships `.npmrc engine-strict=true` + `engines: node ^24.0.0`; the
extension ran npm under the system default v20.19.6, so **npm install refused
outright and node_modules was never created** — yet the add flow proceeded to
`aio app deploy`. The deploy's pre-app-build hook (`npx aio-commerce-lib-app`)
then failed with the misleading "could not determine executable to run", and
npx even fetched the UNSCOPED `aio-commerce-lib-app@0.0.1-security` placeholder
from the registry while looking for the missing local binary. The persisted
component error carries that downstream symptom; the real cause (node too old)
appears nowhere.

## Fix

In the add flow (`componentManager.installComponent` → runner), a failed npm
install ABORTS the add and persists the npm error itself — which in this case
would have said the actionable thing (engine mismatch, wanted ^24, got v20).

## Related, tracked on AB-1d step 5 (not here)

Integration install/build should run under the component's declared node
version via fnm — fnm had v24 available on this machine the whole time; a
catalog entry field (e.g. `nodeVersion`) plus `fnm exec` in the install/deploy
command is the shape. This item is only the fail-fast half.
