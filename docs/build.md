# Building from source

```bash
npm run setup     # install, then compile everything
```

Then press **F5** in VS Code to launch the Extension Development Host.

`postinstall` runs the compile, so a plain `npm install` already leaves you built.

## While you work

```bash
npm run watch:all   # extension + webviews
npm run watch       # extension only
```

With a watch running, reload the dev-host window with **Cmd+R**. F5 is only needed
when the extension host itself has to restart — a change to activation, command
registration, or anything else that runs before a webview exists.

## What the build actually does

**esbuild, not webpack.** There is no webpack in this repository — no dependency, no
config file. If you find instructions about webpack caching or module federation,
they predate the switch and are describing a build that no longer exists.

`npm run compile` clears the webview output, copies `media/`, then runs
`esbuild.config.js --production`, which emits three things:

| Output | From |
|---|---|
| `dist/extension.js` | `src/extension.ts` — CommonJS for the Node extension host |
| `dist/mcp-proxy.js` | `src/mcp-proxy.ts` — the stdio↔socket forwarder Claude Code spawns |
| `dist/webview/*-bundle.js` | one IIFE browser bundle per entry in `WEBVIEW_ENTRIES` |

Narrower targets exist when you need them: `compile:webview` rebuilds only the
bundles, `compile:typescript` runs `tsc` plus `tsc-alias` against
`tsconfig.build.json`.

**Type checking is separate from bundling.** esbuild strips types without checking
them, so a build succeeding tells you nothing about type errors. `npm run gate` runs
both checkers along with everything else CI does.

## When it goes wrong

**Nothing works after switching branches.** `dist/` and `node_modules/` are not
committed, by design. Run `npm run setup`.

**Stale behaviour after a rebuild.** `npm run clean && npm run compile`.
`clean:webview` alone drops just the bundles.

**Module resolution errors mentioning `@/core/...`.** Path aliases have to be
rewritten to relative imports in the emitted JavaScript; `tsc-alias` does that, and
it runs as part of `compile:typescript`. Invoking `tsc` by hand skips it, which is
the usual cause.

**A type error the build did not catch.** Expected — see above. Run `npm run gate`.

## Packaging

`npm run package` produces the `.vsix`. Cutting an actual release is more than that
one command; the `cut-release` skill has the sequence, and it publishes to real
users.
