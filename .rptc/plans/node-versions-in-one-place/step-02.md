# Step 2: Demo Builder's own Node store, and ensure a Node and the Adobe CLI under it

**The store.** `~/.demo-builder/node/`, created on first need. Every fnm call Demo Builder makes
carries `FNM_DIR=<store>` (fnm's own setting: `--fnm-dir` / `FNM_DIR`; measured 2026-10-07, an
empty one lists only `system`). One function, `demoBuilderFnmDir()`, owns the path. The
user's fnm, its versions and its default are never read or written by Demo Builder again,
except by step 8's one-time cleanup.

**Today:** `ensureFnmNodeVersion` (`core/shell/ensureNodeVersion.ts`) runs `fnm install <major>`
and nothing else. The Adobe CLI is installed per Node only by the prerequisites screen
(`aio-cli`, `perNodeVersion: true`, `npm install -g @adobe/aio-cli`, then the `api-mesh` plugin).
So the add door can give a machine Node 24 without `aio` under it, which is what the owner's
machine shows (24.21.0 has no `aio`).

**Change:** `ensureNode(executor, thingId, logger)` in the same module:

1. `fnm install <nodeFor(thingId)>` into the store.
2. When `needsAdobeCli(thingId)`: check `aio --version` under the store's Node
   (`useNodeVersion: major`); when missing, run the install steps from `prerequisites.json`'s
   `aio-cli` entry and its required plugins, under that Node. Read the steps from the
   prerequisites config rather than restating them, so there is one definition of "install the
   Adobe CLI".
3. Return an error string or undefined, as today.

`ensureFnmNodeVersion` stays as the Node-only half and is called by `ensureNode`.

**Callers moved to `ensureNode`:** the App Builder add door (`appBuilderComponentRunner` runAdd
and deploy), the AI tools install and update (AI-13, thing `ai-tools`), the mesh deploy
entry point.

**Tests:** the CLI is installed only when missing and only for things that need it; a failed
install returns the reason; Node-only things never touch `aio`.
