# Step 3: Every caller asks the register

Mechanical, compiler-led (the `ask-the-tool` skill): change the sources, then let `tsc` and the
suite name each caller.

| Today | Becomes |
|---|---|
| `getMeshNodeVersion()` (about 20 call sites: mesh deploy, verify, delete, describe, endpoint, staleness, and two non-mesh Console calls) | `nodeFor('adobe-cli')` |
| `useNodeVersion: 'auto'` (runtimeNamespace, erpCredential, executorAppBuilderPhase, appBuilderComponentTeardown) and `APP_NODE_VERSION = 'auto'` | `nodeFor('adobe-cli')` |
| bare `aio` commands with no version (`CommandExecutor` forces `null` + `enhancePath`) | default `useNodeVersion` for any `aio ` command = `nodeFor('adobe-cli')` |
| the aio-cli refresh in `appDeployment.ts:205` ("default node" on purpose) | under `nodeFor('adobe-cli')`, so the refreshed CLI is the one deploys run |
| `toolManager.ts` `NODE_VERSION = '18'` | `nodeFor('commerce-demo-ingestion')` |
| fallback "20" in `installHandler.ts`, `DependencyResolver.ts`, `startDemo.ts`, `meshConfig.ts` | deleted; the register throws for an undeclared thing |

Then delete what nothing calls: `'auto'` in `NodeVersionValidator` and `resolveAutoNodeVersion`,
`findAdobeCLINodeVersion`'s directory scan, `ensureAdobeCLINodeVersion` / `doNodeVersionSetup`
(its `fnm use` runs in a throwaway shell and changes nothing), `getMeshNodeVersion`,
`getInfrastructureNodeVersion`, and the test-only `buildCommandWithEnvironment`,
`getSessionNodeVersion`, `isSessionNodeVersionSet`. No soft deprecation.

**Watch:** `enhancePath` still prepends every fnm version's `bin` in directory order. With every
`aio` call wrapped in `fnm exec --using=24`, the wrapped Node's own `bin` comes first, so `aio`
resolves to the one installed under 24 (step 2 guarantees it exists). Verify that ordering in a
test of the composed command, and live in step 8.

**Tests:** existing mesh/App Builder suites move from asserting '20'/'auto' to asserting the
register's value; one test that no source file contains a Node-version literal outside the
catalogs (a grep enforcer in `tests/sop/`, so new literals fail the build).
