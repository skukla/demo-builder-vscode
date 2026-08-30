/**
 * The registry and the disk agree — in BOTH directions.
 *
 * A list of tools decays exactly like the tools did. The audit that produced
 * `toolingRegistry.ts` found three instruments nothing listed and nothing ran;
 * writing them into a file fixes that once and guarantees nothing about next
 * month. So the list is not the mechanism — this suite is.
 *
 * Adding a skill without registering it fails here. Deleting one without
 * deregistering it fails here too, which is the direction people forget: a
 * registry full of entries for things that no longer exist reads as coverage.
 *
 * WHAT IS DELIBERATELY NOT ENUMERATED. Hook rules and the other SOP suites are
 * self-enumerating — they are discovered by directory and they RUN, so one that
 * rots produces a failure on its own. Registering them would be bookkeeping that
 * prevents no failure. This suite asserts those layers are populated (so a
 * broken glob cannot read as "no instruments") and leaves their contents to the
 * enforcers that already walk them.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import {
    INSTRUMENTS,
    sweepable,
    isSweepable,
    NON_INSTRUMENT_SCRIPTS,
    type Instrument,
} from './toolingRegistry';

const REPO_ROOT = join(__dirname, '..', '..');
const SKILLS_DIR = join(REPO_ROOT, '.claude', 'skills');
const HOOK_RULES_DIR = join(REPO_ROOT, '.claude', 'hooks', 'rules');

const skillsOnDisk = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

const packageScripts: Record<string, string> = JSON.parse(
    readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')
).scripts;

/**
 * Which npm scripts must be registered. `validate:*` and `*:drift` are checks by
 * naming convention; `test:*` are runners, not checks, and are excluded.
 */
function isCheckScript(name: string): boolean {
    return name.startsWith('validate:') || name.endsWith(':drift');
}

const registered = new Map<string, Instrument>(INSTRUMENTS.map((i) => [i.id, i]));

/**
 * The cadence table in the root CLAUDE.md states a COUNT of enforcer suites. A count
 * in prose is a claim, and this repo's rule is that a claim needs something keeping it
 * true. It did not have one: the table said 18 while 19 existed on disk, found on
 * 2026-08-30 while adding the 19th.
 *
 * The registry itself carries no `sop-test` entries — enforcer suites run under jest,
 * so unlike a periodic scan they cannot silently stop running, and listing all 19 would
 * be bookkeeping for its own sake. What CAN rot is the number written down beside them,
 * so that is what is checked.
 */
describe('the enforcer-suite count in CLAUDE.md matches the disk', () => {
    const CLAUDE_MD = join(__dirname, '..', '..', 'CLAUDE.md');

    it('CONTROL: the cadence row is present and states a number', () => {
        const row = readFileSync(CLAUDE_MD, 'utf8').match(
            /\|\s*per-jest-run\s*\|\s*(\d+) enforcer suites/
        );
        expect(row).not.toBeNull();
    });

    it('the handbook states the same two counts as CLAUDE.md does', () => {
        // The handbook lists the enforcement layers with counts of its own. Written
        // in prose, unchecked, and wrong within the hour of being edited — the fifth
        // instance of this failure found on 2026-08-30, and the reason it is pinned.
        const hb = readFileSync(join(REPO_ROOT, 'docs/development/handbook.md'), 'utf8');
        const suites = hb.match(/(\d+) in `tests\/sop\/`/);
        const hooks = hb.match(/(\d+) rules in `\.claude\/hooks\/rules\/`/);
        expect({ suites: suites?.[1], hooks: hooks?.[1] }).toEqual({
            suites: String(readdirSync(__dirname).filter((f) => f.endsWith('.test.ts')).length),
            hooks: String(readdirSync(HOOK_RULES_DIR).filter((f) => f.endsWith('.rule')).length),
        });
    });

    it('the stated hook-rule count equals the rules on disk', () => {
        // Added 2026-08-30 with the tenth rule, when CLAUDE.md still said nine.
        // The suite count below was pinned; this one was not, so the same class of
        // unchecked prose count had gone stale in the row directly above it.
        const claimed = Number(
            readFileSync(CLAUDE_MD, 'utf8').match(/\|\s*per-tool-call\s*\|\s*(\d+) hook rules/)![1]
        );
        const onDisk = readdirSync(HOOK_RULES_DIR).filter((f) => f.endsWith('.rule')).length;
        expect({ claimed, onDisk }).toEqual({ claimed: onDisk, onDisk });
    });

    it('the stated count equals the suites in tests/sop/', () => {
        const claimed = Number(
            readFileSync(CLAUDE_MD, 'utf8').match(
                /\|\s*per-jest-run\s*\|\s*(\d+) enforcer suites/
            )![1]
        );
        const onDisk = readdirSync(__dirname).filter((f) => f.endsWith('.test.ts')).length;
        expect({ claimed, onDisk }).toEqual({ claimed: onDisk, onDisk });
    });
});

describe('the tooling registry matches what is on disk', () => {
    it('CONTROL: the registry and both directory walks are non-empty', () => {
        // Without this, a broken path makes every assertion below pass over an
        // empty list — the precise failure mode the repo has been bitten by.
        expect(INSTRUMENTS.length).toBeGreaterThan(20);
        expect(skillsOnDisk).toContain('gate');
        expect(Object.keys(packageScripts).filter(isCheckScript).length).toBeGreaterThan(3);
        expect(readdirSync(HOOK_RULES_DIR).length).toBeGreaterThan(3);
    });

    it('registers every skill that exists', () => {
        const unregistered = skillsOnDisk.filter((s) => !registered.has(s));
        expect(unregistered).toEqual([]);
    });

    it('registers every check script that exists', () => {
        const unregistered = Object.keys(packageScripts)
            .filter(isCheckScript)
            .filter((s) => !registered.has(s))
            .sort();
        expect(unregistered).toEqual([]);
    });

    it('the gate skill and the gate script run the same number of steps', () => {
        // PL-27's answer. `gate` is the most-invoked skill here and its pre-push
        // section used to be six commands listed for a human to run by hand. A list
        // of six is a memory test, and it had already been failed twice — once in
        // 2026-07-30's dream run, once by a session that ran three of the six all
        // day. It is now `npm run gate`, and the skill documents the steps in a
        // table so a failure is readable without opening package.json.
        //
        // That table is a second copy of the chain, so it is pinned to it.
        const script = packageScripts['gate'];
        expect(typeof script).toBe('string');
        const steps = script.split('&&').length;
        expect(steps).toBeGreaterThan(3);

        const skill = readFileSync(join(SKILLS_DIR, 'gate', 'SKILL.md'), 'utf-8');
        const rows = [...skill.matchAll(/^\| \d+ \| `/gm)].length;
        expect({ scriptSteps: steps, documentedRows: rows }).toEqual({
            scriptSteps: steps,
            documentedRows: steps,
        });
    });

    it('names every skill in the root CLAUDE.md, which is what makes it loadable', () => {
        // Registration and ROUTING are different things, and this is the gap between
        // them. `mutation-test-pilot` and `test-strategy-scan` were both registered
        // above — so every assertion here passed — while being absent from CLAUDE.md's
        // skill list, which is the only place an agent learns a skill exists. A skill
        // nothing routes to is never loaded, however correct its body is.
        //
        // It must match the skill's OWN ENTRY, not merely its name somewhere in the
        // file. Written first as a bare `includes`, this passed a planted defect: the
        // routing bullet was deleted and one sibling bullet's cross-reference kept the
        // name present, so the check read as green over exactly the rot it exists for.
        // An entry is the name plus its em-dash description, WHEREVER it sits — several
        // skills legitimately share one bullet (`gate` — … · `cut-release` — …), so
        // anchoring to the start of a line wrongly flagged three real entries.
        const claudeMd = readFileSync(join(REPO_ROOT, 'CLAUDE.md'), 'utf-8');
        const routed = new Set([...claudeMd.matchAll(/`([a-z0-9-]+)` +—/g)].map((m) => m[1]));
        const unrouted = skillsOnDisk.filter((s) => !routed.has(s));
        expect(unrouted).toEqual([]);
    });

    it('has no entry for a skill that was deleted', () => {
        // The direction people forget. A stale entry reads as coverage.
        const ghosts = INSTRUMENTS.filter(
            (i) => i.kind === 'skill' && !existsSync(join(SKILLS_DIR, i.id))
        ).map((i) => i.id);
        expect(ghosts).toEqual([]);
    });

    it('has no entry for an npm script that was deleted', () => {
        const ghosts = INSTRUMENTS.filter(
            (i) => i.kind === 'npm-script' && !(i.id in packageScripts)
        ).map((i) => i.id);
        expect(ghosts).toEqual([]);
    });
});

describe("the program's own instruments cannot go dark", () => {
    /**
     * Every executable under `.rptc/`, from git rather than a filesystem walk —
     * an untracked scratch script is not something the repo owes an answer for.
     */
    const rptcScripts = execFileSync(
        'git',
        ['ls-files', '.rptc/**/*.mjs', '.rptc/**/*.js', '.rptc/**/*.sh'],
        { cwd: REPO_ROOT, encoding: 'utf8' }
    )
        .split('\n')
        .filter(Boolean)
        .sort();

    const registeredPaths = new Set(INSTRUMENTS.map((i) => i.path).filter(Boolean));

    it('CONTROL: the git listing finds the instruments it is meant to audit', () => {
        expect(rptcScripts.length).toBeGreaterThan(10);
        expect(rptcScripts).toContain(
            '.rptc/plans/pattern-conformance-audit/harness/program-metrics.mjs'
        );
    });

    it('accounts for every .rptc executable — as an instrument or as a stated one-shot', () => {
        // The gap this closes: 24 scripts, several of them the program's own
        // measurement tools, reachable from nothing. One had been crashing since
        // the ADR-015/017 split and nobody knew.
        const unaccounted = rptcScripts.filter(
            (p) => !registeredPaths.has(p) && !(p in NON_INSTRUMENT_SCRIPTS)
        );
        expect(unaccounted).toEqual([]);
    });

    it('has no exemption for a script that no longer exists', () => {
        const onDisk = new Set(rptcScripts);
        const ghosts = Object.keys(NON_INSTRUMENT_SCRIPTS).filter((p) => !onDisk.has(p));
        expect(ghosts).toEqual([]);
    });

    it('gives every exemption a reason', () => {
        const unexplained = Object.entries(NON_INSTRUMENT_SCRIPTS)
            .filter(([, why]) => why.trim().length < 15)
            .map(([p]) => p);
        expect(unexplained).toEqual([]);
    });

    it('points every registered instrument at a file that exists', () => {
        const broken = INSTRUMENTS.filter((i) => i.path)
            .filter((i) => !existsSync(join(REPO_ROOT, i.path as string)))
            .map((i) => i.id);
        expect(broken).toEqual([]);
    });
});

describe('every entry says enough to be actionable', () => {
    it('CONTROL: the fields being checked are actually populated somewhere', () => {
        expect(INSTRUMENTS.some((i) => i.runs !== null)).toBe(true);
        expect(INSTRUMENTS.some((i) => i.unwiredReason)).toBe(true);
    });

    it('describes what each instrument catches', () => {
        const vague = INSTRUMENTS.filter((i) => i.what.trim().length < 15).map((i) => i.id);
        expect(vague).toEqual([]);
    });

    it('explains every instrument that runs nothing', () => {
        // An entry with no command and no reason is the shape the whole audit
        // was about: a tool present, listed, and connected to nothing.
        const unexplained = INSTRUMENTS.filter((i) => i.runs === null && !i.unwiredReason).map(
            (i) => i.id
        );
        expect(unexplained).toEqual([]);
    });

    it('names a real command for everything the sweep will execute', () => {
        // `npm run sweep` shells these out. A typo here fails at 2am in a
        // release cut, so check the referenced file exists now.
        const broken = sweepable()
            .filter((i) => {
                const script = /^bash (\S+)/.exec(i.runs as string)?.[1];
                return script ? !existsSync(join(REPO_ROOT, script)) : false;
            })
            .map((i) => i.runs);
        expect(broken).toEqual([]);
    });

    it('says whether the exit code means anything, for everything it runs', () => {
        // The sweep printed "clean" over a scan that had just reported a 34%
        // gap, because the scan always exits 0 and nothing said so. An
        // instrument with a command and no resultKind can repeat that.
        const unstated = INSTRUMENTS.filter((i) => i.runs !== null && !i.resultKind).map(
            (i) => i.id
        );
        expect(unstated).toEqual([]);
    });

    it('CONTROL: both result kinds are actually in use', () => {
        // If everything were one kind, the field would be decoration and the
        // assertion above would pass while proving nothing.
        const kinds = new Set(INSTRUMENTS.map((i) => i.resultKind).filter(Boolean));
        expect([...kinds].sort()).toEqual(['gate', 'report']);
    });

    /**
     * The safety property, learned the hard way: `classify.mjs` rewrites the
     * audit ledger and was run blind to see if it still worked, taking it from
     * 998 rows to 5. A sweep is something you run without thinking; a writer is
     * not.
     *
     * Tested through the PREDICATE, against a constructed writer. The first
     * version asserted `sweepable().filter(i => i.writes)` was empty — true by
     * construction, so it could not fail, and flipping a real writer to
     * `periodic` passed it. Planting that mutation is what found the hole.
     */
    const writerThatWantsToBeSwept: Instrument = {
        id: 'planted-writer',
        kind: 'rptc-instrument',
        cadence: 'periodic',
        resultKind: 'report',
        what: 'a constructed writer, to prove the guard actually refuses one',
        runs: 'node nowhere.mjs',
        writes: true,
    };

    it('refuses a periodic instrument that writes', () => {
        expect(isSweepable(writerThatWantsToBeSwept)).toBe(false);
    });

    it('CONTROL: the same instrument IS sweepable once it stops writing', () => {
        // Without this, a predicate hardcoded to `false` would pass the test above.
        expect(isSweepable({ ...writerThatWantsToBeSwept, writes: false })).toBe(true);
    });

    it('keeps every real writer out of the sweep', () => {
        expect(
            sweepable()
                .filter((i) => i.writes)
                .map((i) => i.id)
        ).toEqual([]);
        // ...and the registry really does contain writers, so that means something.
        expect(INSTRUMENTS.filter((i) => i.writes).length).toBeGreaterThan(0);
    });

    it('points every npm-script entry at a script that exists', () => {
        const broken = INSTRUMENTS.filter((i) => i.kind === 'npm-script')
            .filter((i) => !(i.id in packageScripts))
            .map((i) => i.id);
        expect(broken).toEqual([]);
    });
});
