/**
 * Cloud reversals — every cloud resource the extension creates has its removal, and a
 * path an SC can use to reach it.
 *
 * WHY THIS EXISTS. Property 1 of the root CLAUDE.md ("whatever can be done can be
 * undone") was prose that nothing checked. The beta.153 walk then found two creates
 * with no way back: the Configuration Service site record (EDS-73) and the mesh and
 * App Builder integrations a project leaves deployed when it is deleted (AB-87). Both
 * were found by a person reading code; nothing failed.
 *
 * WHAT IT CHECKS (`cloud-reversals.ledger.json`, scanner in `cloudReversalsScan.ts`):
 *  - the net: every file whose code makes a cloud write is claimed, with its exact hit
 *    count, by a resource row or by a reason it creates nothing (both directions);
 *  - each row: its create primitive still exists (no ghost rows), its removal exists,
 *    and every reversal path it names reaches that removal through imports;
 *  - Delete Project: each row says whether Delete Project removes it, leaves it on
 *    purpose, or leaves it as debt naming a backlog item; the debt count only falls.
 *
 * Static, with its limits written in the ledger's `_method`.
 *
 * @see docs/development/handbook.md — the convention, "Every cloud resource the
 *   extension creates has its removal"
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { ALL_FILES, ROOT, stripComments } from '../sop/architectureScan';
import {
    diffClaims,
    ghostRows,
    importClosure,
    LEDGER,
    reaches,
    valueImports,
    verdictKinds,
    writeHits,
    type CloudReversalLedger,
} from './cloudReversalsScan';

/** Every src file, comment-stripped, keyed src-relative (the ledger's spelling). */
const SOURCES = new Map(
    ALL_FILES.map((f) => [
        f.replace(/^src\//, ''),
        stripComments(readFileSync(join(ROOT, f), 'utf8')),
    ])
);
const ROWS = Object.entries(LEDGER.resources);
const DELETE_PROJECT = 'delete-project';
const entryOf = (id: string): string => LEDGER.reversals[id]?.entry ?? `<no reversal ${id}>`;

/** Backlog ids declared in frontmatter (`id: X`), read from the files themselves. */
const BACKLOG_IDS = new Set(
    readdirSync(join(ROOT, '.rptc/backlog'), { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.md'))
        .flatMap((f) => {
            const m = /^id:\s*(\S+)\s*$/m.exec(
                readFileSync(join(ROOT, '.rptc/backlog', f), 'utf8')
            );
            return m ? [m[1]] : [];
        })
);

describe('cloud reversals: the scanner', () => {
    it('CONTROL: each write signature catches a planted write and passes a read', () => {
        const planted = new Map([
            ['svc/a.ts', "await fetch(url, { method: 'POST', body });"],
            ['svc/b.ts', "await octokit.request('DELETE /repos/{owner}/{repo}', { owner });"],
            [
                'svc/c.ts',
                'await run(`aio api-mesh:${command} "${p}"`); await run("aio app deploy");',
            ],
            ['svc/d.ts', 'await client.createWorkspace(org, id, {}); client.subscribeX(a);'],
            ['svc/e.ts', "await execFile('git', ['-C', dir, 'push']);"],
            ['svc/read.ts', "await fetch(url, { method: 'GET' }); run('aio api-mesh:describe');"],
            ['feature/ui/Button.tsx', "fetch(url, { method: 'PUT' });"],
        ]);
        const hits = writeHits(planted);
        expect([...hits.keys()].sort()).toStrictEqual([
            'svc/a.ts',
            'svc/b.ts',
            'svc/c.ts',
            'svc/d.ts',
            'svc/e.ts',
        ]);
        expect(hits.get('svc/c.ts')).toHaveLength(2);
        expect(hits.get('svc/d.ts')).toHaveLength(2);
    });

    it('CONTROL: an unpaired create fails, as do a stale claim, a moved count and a double claim', () => {
        const hits = writeHits(
            new Map([
                ['svc/claimed.ts', "send('POST', 'products'); send('DELETE', 'products/1');"],
                ['svc/new.ts', "await fetch(url, { method: 'PUT' });"],
            ])
        );
        const ledger: Pick<CloudReversalLedger, 'resources' | 'notCreates'> = {
            resources: {
                thing: {
                    what: 'x',
                    create: "'POST'",
                    reversedBy: [],
                    projectDelete: {},
                    sites: { 'svc/claimed.ts': 1, 'svc/gone.ts': 1 },
                },
            },
            notCreates: { 'svc/claimed.ts': { hits: 2, why: 'twice' } },
        };
        expect(diffClaims(hits, ledger)).toStrictEqual({
            unclaimed: ['svc/new.ts'],
            stale: ['svc/gone.ts'],
            miscounted: [],
            twice: ['svc/claimed.ts'],
        });
        const once = { ...ledger, notCreates: {} };
        expect(diffClaims(hits, once).miscounted).toStrictEqual([
            'svc/claimed.ts: ledger 1, found 2',
        ]);
    });

    it('CONTROL: a ghost row (its create gone from its sites) is reported', () => {
        const sources = new Map([['svc/repo.ts', "octokit.request('POST /user/repos', b);"]]);
        const resources = {
            live: { create: "'POST /user/repos'", sites: { 'svc/repo.ts': 1 } },
            ghost: { create: "'POST /orgs/\\{org\\}/repos'", sites: { 'svc/repo.ts': 1 } },
        };
        expect(ghostRows(sources, resources)).toStrictEqual(['ghost']);
    });

    it('CONTROL: a removal not reachable from its path fails; value and dynamic imports reach, types do not', () => {
        const sources = new Map([
            ['a/entry.ts', "import { x } from './step';\nimport type { T } from '../b/remover';"],
            ['a/step.ts', "export const x = 1;\nconst m = await import('@/c/lazy');"],
            ['b/remover.ts', 'await repo.deleteThing(id);'],
            ['c/lazy.ts', "import { type U, type V } from '../b/remover';\nexport const y = 2;"],
            ['d/other.ts', "import { deleteThing } from '../b/remover';"],
        ]);
        expect([...importClosure(sources, 'a/entry.ts')].sort()).toStrictEqual([
            'a/entry.ts',
            'a/step.ts',
            'c/lazy.ts',
        ]);
        expect(reaches(sources, 'a/entry.ts', '\\.deleteThing\\(')).toBe(false);
        expect(reaches(sources, 'd/other.ts', '\\.deleteThing\\(')).toBe(true);
        expect(
            valueImports('d/other.ts', sources.get('d/other.ts')!, new Set(sources.keys()))
        ).toStrictEqual(['b/remover.ts']);
    });

    it('CONTROL: the corpus is real, and reachability separates a known gap from a known path', () => {
        // Same scope as the real checks: the real sources, the real Delete Project entry.
        expect(SOURCES.size).toBeGreaterThan(500);
        const del = entryOf(DELETE_PROJECT);
        expect(importClosure(SOURCES, del).size).toBeGreaterThan(100);
        expect(reaches(SOURCES, del, LEDGER.resources['github-repository'].remove!)).toBe(true);
        expect(reaches(SOURCES, del, LEDGER.resources['config-service-site'].remove!)).toBe(false);
        expect(reaches(SOURCES, del, LEDGER.resources['api-mesh'].remove!)).toBe(false);
    });
});

describe('cloud reversals: the ledger against src/', () => {
    const HITS = writeHits(SOURCES);

    it('every file that writes to a cloud is claimed, with its exact count (both directions)', () => {
        expect(HITS.size).toBeGreaterThan(50);
        expect(diffClaims(HITS, LEDGER)).toStrictEqual({
            unclaimed: [],
            stale: [],
            miscounted: [],
            twice: [],
        });
    });

    it('every row still has its create primitive in one of its sites (no ghost rows)', () => {
        expect(ghostRows(SOURCES, LEDGER.resources)).toStrictEqual([]);
    });

    it('every named removal exists in src/, and every reversal entry is a real file', () => {
        const absent = ROWS.filter(
            ([, r]) => r.remove && ![...SOURCES.values()].some((c) => new RegExp(r.remove!).test(c))
        ).map(([id]) => id);
        const entries = Object.values(LEDGER.reversals).map((p) => p.entry);
        expect({ absent, missingEntries: entries.filter((e) => !SOURCES.has(e)) }).toStrictEqual({
            absent: [],
            missingEntries: [],
        });
    });

    it.each(ROWS.filter(([, r]) => r.reversedBy.length > 0))(
        '%s: every reversal path it names reaches its removal',
        (_, row) => {
            const unreached = row.reversedBy.filter(
                (p) => !reaches(SOURCES, entryOf(p), row.remove ?? '$^')
            );
            expect(unreached).toStrictEqual([]);
        }
    );
});

describe('cloud reversals: Delete Project and the exemptions', () => {
    const exemptions = ROWS.filter(([, r]) => r.projectDelete.exemption);

    it('every row sets exactly one Delete Project verdict, consistent with its paths', () => {
        const problems = ROWS.flatMap(([id, r]) => {
            const kinds = verdictKinds(r.projectDelete);
            const out: string[] = [];
            if (kinds.length !== 1) out.push(`${id}: verdicts ${kinds.join(',') || 'none'}`);
            if (r.projectDelete.removes && !r.reversedBy.includes(DELETE_PROJECT)) {
                out.push(`${id}: says Delete Project removes it but does not name that path`);
            }
            if (r.reversedBy.length === 0 && !r.projectDelete.exemption) {
                out.push(`${id}: no reversal at all, and not an exemption`);
            }
            return out;
        });
        expect(problems).toStrictEqual([]);
    });

    it('every exemption names a backlog item that exists, and is still a real gap', () => {
        expect(BACKLOG_IDS.has('EDS-73')).toBe(true); // control: the reader finds ids
        const problems = exemptions.flatMap(([id, r]) => {
            const out: string[] = [];
            const backlog = r.projectDelete.backlog ?? '';
            if (!BACKLOG_IDS.has(backlog))
                out.push(`${id}: no backlog item ${backlog || '(none)'}`);
            // Paid debt: Delete Project now reaches the removal, so the row should say `removes`.
            if (r.remove && reaches(SOURCES, entryOf(DELETE_PROJECT), r.remove)) {
                out.push(`${id}: Delete Project already reaches its removal`);
            }
            return out;
        });
        expect(problems).toStrictEqual([]);
    });

    it('the number of exemptions only falls', () => {
        const count = exemptions.length;
        const ceiling = LEDGER.exemptionCeiling;
        // Above: a new exemption; give it its removal instead. Below: lower the pin.
        expect({
            count,
            verdict: count > ceiling ? 'GREW' : count < ceiling ? 'LOWER_THE_PIN' : 'at',
        }).toStrictEqual({ count: ceiling, verdict: 'at' });
    });
});
