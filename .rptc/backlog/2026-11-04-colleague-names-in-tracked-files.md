---
id: PL-93
kind: chore
area: platform
needs: []
value: low
status: backlog
---

# Colleague first names in tracked files

Filed 2026-11-04 from the PL-91 audit (§7 aside). Owner: defer.

`.rptc/CLAUDE.md` says never name a colleague in a tracked file; write the role. The repo is
public. `grep -rn "Jeff" .rptc docs tests` finds 14 files: plans (`datapack-store/overview.md`,
`step-02b.md`), completed records (`data-installer-plan`, `bodea-template`,
`datapack-import-targeting`, `datapack-import-dependencies`), one backlog item
(`2026-08-23-datapack-authoring-loop.md`), one research file (`adobe-project-ownership`), and two
test comments (`importHandlers.test.ts:159`, `dataInstallerWriteClient.test.ts:144`).

Fix: replace with "the service author" or "the service owner". Quoted owner sentences keep the
quote and lose the name. One doc example that used a colleague's personal GitHub namespace as an
`org` value was replaced with a placeholder on 2026-11-04 (`docs/systems/sharing-a-demo.md:97`);
the same value remains as a fixture in four EDS reset tests, which is a public GitHub owner name
and can stay or follow this sweep.
