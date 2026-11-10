---
id: PL-96
kind: chore
area: platform
needs: []
value: med
status: backlog
---

# Dependabot's open alerts on the lockfile

Filed 2026-11-09, on the owner's word, after a push printed GitHub's warning: 209 known
vulnerabilities on the default branch (5 critical, 78 high, 105 moderate, 21 low).

## What the alerts are (read 2026-11-09, `gh api repos/…/dependabot/alerts?state=open`)

207 open alerts, every one in `package-lock.json`.

| Severity | Count |
|---|---|
| Critical | 5 |
| High | 77 |
| Medium | 104 |
| Low | 21 |

Dependabot calls 142 of them runtime and 65 development. That is the lockfile's view: a package
counted runtime is in `dependencies`, not necessarily in the VSIX. esbuild bundles only what the
extension imports, so which alerts reach an SC's machine is the first thing to find out, not
something this count says.

The five critical:

- `handlebars`, three alerts, development.
- `shell-quote`, one alert, development.
- `proxy-addr`, one alert, runtime.

Most alerts by package: `axios` 31, `hono` 26, `undici` 21, `fast-uri` 12, `handlebars` 10,
`brace-expansion` 10, `js-yaml` 10, `adm-zip` 8, `joi` 6, `@modelcontextprotocol/sdk` 6.

## The work

1. For each package, say whether the VSIX ships it (the bundle and `vsix-contents.test.ts`), what
   pulls it in (`npm ls <name>`), and whether a patched version is in range.
2. Update what can be updated within range; for the rest, the direct dependency that holds the old
   version back, and whether moving it is a breaking change.
3. Anything the VSIX ships at critical or high goes before the next release; development-only
   tooling can follow in its own pass.
4. Run the full gate after each group of updates: a lockfile change can move behaviour that no
   type sees.

Not decided: whether this blocks beta.153. The owner asked for it to be filed, not scheduled.
