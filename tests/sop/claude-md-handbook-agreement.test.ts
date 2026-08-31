/**
 * Rules stated in BOTH `CLAUDE.md` and the handbook must still be stated in both.
 *
 * WHY THIS IS NOT "DE-DUPLICATE THEM". The obvious reading of two documents
 * carrying the same rule is that one copy should go. That is wrong here, and the
 * reason is mechanical rather than editorial:
 *
 *   - `CLAUDE.md` is loaded into every agent session automatically. It is what
 *     actually steers the work.
 *   - `docs/development/handbook.md` is not loaded. It is what a human reads to
 *     understand the codebase.
 *
 * Delete the rule from CLAUDE.md and agents stop seeing it. Delete it from the
 * handbook and it stops being explained. The duplication is doing a job.
 *
 * What was genuinely broken is that nothing connected the two, so an edit to one
 * left the other quietly stale — the same failure this repo has now found in a
 * backlog index, an ADR table, and a hook pre-filter. So the pairs are pinned.
 *
 * WHAT THIS CANNOT DO: it proves both documents still state the rule, not that
 * they say the same thing about it. Two probes matching is evidence the rule
 * survived an edit, not that the wording stayed in agreement. Reading them is
 * still a release-cut job.
 */
import { execSync } from 'child_process';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
/**
 * Whitespace-flattened, because both documents wrap prose at ~95 columns and a
 * rule's sentence is routinely split across lines — with a `> ` quote marker in
 * the middle of it in the handbook. Matching raw text makes the check fail on
 * reflow, which is noise rather than signal.
 */
const flatten = (name: string): string =>
    readFileSync(join(ROOT, name), 'utf8')
        .toLowerCase()
        .replace(/\n>\s*/g, ' ')
        .replace(/\s+/g, ' ');

const CLAUDE_MD = flatten('CLAUDE.md');
const HANDBOOK = flatten('docs/development/handbook.md');

/**
 * One row per rule that BOTH documents state. Each side is a distinctive phrase
 * from that document's own wording — they differ on purpose, because the two are
 * written for different readers and must be allowed to.
 *
 * Adding a rule to both documents means adding a row. Removing it from one means
 * removing the row, which is the moment to decide whether it should also leave
 * the other.
 */
const PAIRED: ReadonlyArray<{ rule: string; claudeMd: string; handbook: string }> = [
    // Added 2026-08-30. These three verification rules lived ONLY in CLAUDE.md, so an
    // agent saw them every session and a human reader never met them explained. The
    // first of them was violated the same day it was paired: a status summary reported
    // two tracks of shipped work as "not started" because it grepped for a label rather
    // than for the work. Pairing does not prevent that — the rule was in context and was
    // not applied — but a rule that steers the work belongs in both documents, and
    // unpaired it was also unpinned.
    {
        rule: 'a control proves the tool works, not that you aimed it right',
        claudeMd: 'not that you aimed it right',
        handbook: 'say where the answer would be if it existed',
    },
    {
        rule: 'a named field is a lead, not a finding',
        claudeMd: 'is a lead, not a finding',
        handbook: 'read the source before it becomes a finding',
    },
    {
        rule: 'never publish an identifier you have not read from the source',
        claudeMd: 'never publish an identifier you have not read',
        handbook: 'never publish an identifier you have not read from the source',
    },
    {
        rule: 'a cast in argument position is a silenced type error',
        claudeMd: 'a cast at a call boundary is a silenced type error',
        handbook: 'never pass an argument as `any` or `never`',
    },
    {
        rule: 'a shape the compiler cannot read will be invented',
        claudeMd: 'will be invented',
        handbook: 'lives in a typechecked file and is typed to the real interface',
    },
    {
        rule: 'a comment about another module is a claim',
        claudeMd: 'another module does is a claim',
        handbook: 'must cite the code that makes it true',
    },
    {
        rule: 'name the falsifying command before naming a cause',
        claudeMd: 'name the command that would falsify it',
        handbook: 'name the command that would prove you wrong',
    },
    {
        rule: 'an exit code read through a pipe is not a check',
        claudeMd: 'is not a check',
        handbook: 'capture an exit code in a variable',
    },
    {
        rule: 'quote glob arguments in zsh',
        claudeMd: 'quote glob arguments in zsh',
        handbook: 'quote glob arguments',
    },
    {
        rule: 'a nothing-found result needs a positive control',
        claudeMd: 'positive control',
        handbook: 'declares a control',
    },
];

describe('the counts CLAUDE.md states match the registries they count', () => {
    // Added after planting each of these as a drift and watching the suite pass.
    // A stated number is a claim with a maintainer, and these had none: the glossary
    // says how many stacks and demo packages exist, and both would have gone stale
    // the next time either registry grew.
    //
    // AI_CONTEXT_VERSION is deliberately NOT here. It bumps on every bundle change,
    // so pinning prose to it buys churn rather than safety — the fix there was to
    // stop stating the number at all.
    const registry = (file: string, key: string): number => {
        const json = JSON.parse(
            readFileSync(join(ROOT, `src/features/components/config/${file}`), 'utf8')
        ) as Record<string, unknown[]>;
        return json[key].length;
    };

    it('CONTROL: both registries parse and are non-empty', () => {
        expect(registry('stacks.json', 'stacks')).toBeGreaterThan(0);
        expect(registry('demo-packages.json', 'packages')).toBeGreaterThan(0);
    });

    it('states the right number of stacks', () => {
        expect(CLAUDE_MD).toContain(`(${registry('stacks.json', 'stacks')} of them, a list`);
    });

    it('states the right number of demo packages', () => {
        expect(CLAUDE_MD).toContain(`(${registry('demo-packages.json', 'packages')} of them,`);
    });

    // CLAUDE.md tells every agent session how many conventions exist and how many are
    // enforced. Those two numbers sat beside a GENERATED index that recomputes them on
    // every run, with nothing connecting the pair — so cataloguing one convention on
    // 2026-08-30 left the hand-written copy stale the same minute. Read from the
    // generated file, which derives them from the handbook's own callouts.
    const CONVENTIONS = readFileSync(join(ROOT, 'docs/development/conventions.md'), 'utf8');
    const stated = (label: string): string =>
        new RegExp(`\\*\\*(\\d+)\\*\\* ${label}`).exec(CONVENTIONS)?.[1] ?? '';

    it('CONTROL: the generated index states both figures', () => {
        expect(stated('conventions')).toMatch(/^\d+$/);
        expect(stated('enforced')).toMatch(/^\d+$/);
    });

    // THREE documents quote this pair, not two. Phase B found CONTRIBUTING.md still
    // saying "63 of them, 57 with an enforcer" — two versions behind, and stale before
    // today's change rather than because of it. Pinning two copies of a number that
    // lives in three places is how the third one rots quietly.
    const QUOTERS = ['CLAUDE.md', 'CONTRIBUTING.md'];

    it.each(QUOTERS)('%s states the convention counts the generated index computed', (f) => {
        const body = readFileSync(join(ROOT, f), 'utf8');
        expect(body).toContain(
            `${stated('conventions')} of them, ${stated('enforced')} with an enforcer`
        );
    });
});

describe('the skill counts ai-context-authoring states match the writer it documents', () => {
    // Found stale 2026-08-30 while reading every document: the skill said the writer
    // ships "13 always-on" skills and that an EDS project pins "14 as of v7: 13
    // always-on + extend-app-builder-app". The array holds FOURTEEN, so both halves of
    // that arithmetic were wrong. The skillsWriter suites had pinned the true numbers
    // (14 gated-in, 11 gated-out) the entire time — nothing connected them to the prose
    // that tells an author what to expect, which is the same gap as the stacks count
    // above and the ADR index's routing table.
    const AI_TS = readFileSync(join(ROOT, 'src/types/ai.ts'), 'utf8');
    const SKILL = readFileSync(join(ROOT, '.claude/skills/ai-context-authoring/SKILL.md'), 'utf8');

    /** Names inside an `export const NAME = [ ... ] as const` array literal. */
    const arrayNames = (constName: string): string[] => {
        const block = AI_TS.split(`${constName} = [`)[1]?.split(']')[0] ?? '';
        return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    };
    /** Keys inside the `SKILL_MCP_TOOL_DEPENDENCIES` object literal. */
    const gatedNames = (): string[] => {
        const block = AI_TS.split('SKILL_MCP_TOOL_DEPENDENCIES = {')[1]?.split('}')[0] ?? '';
        return [...block.matchAll(/'([^']+)':/g)].map((m) => m[1]);
    };

    const alwaysOn = arrayNames('DEMO_BUILDER_ALWAYS_ON_SKILLS');
    const gated = gatedNames();

    it('CONTROL: both registries parse and are non-empty', () => {
        expect(alwaysOn.length).toBeGreaterThan(0);
        expect(gated.length).toBeGreaterThan(0);
        // Every gated skill must BE an always-on skill, or the subtraction below is
        // arithmetic over two unrelated sets.
        expect(alwaysOn).toEqual(expect.arrayContaining(gated));
    });

    it('states the gated-in and gated-out counts the writer actually produces', () => {
        expect(SKILL).toContain(`**${alwaysOn.length}** always-on`);
        expect(SKILL).toContain(`**${alwaysOn.length - gated.length}** without`);
    });

    it('states how many of them are delivery-gated', () => {
        expect(SKILL).toContain(`${gated.length} of the ${alwaysOn.length} are delivery-gated`);
    });

    it('ships a template file for every skill the writer can deliver', () => {
        const templates = readdirSync(join(ROOT, 'src/features/project-creation/templates/skills'))
            .filter((f) => f.endsWith('.md'))
            .map((f) => f.replace(/\.md$/, ''))
            .sort();
        const declared = [...alwaysOn, ...arrayNames('DEMO_BUILDER_CONDITIONAL_SKILLS')].sort();
        expect(templates).toEqual(declared);
    });
});

describe('the AI-bundle gate seams named in CLAUDE.md all still exist', () => {
    // "Change all or none" is only useful if the list is the real list. A seam that
    // gets renamed and quietly dropped from the doc turns a change-all-or-none rule
    // into a change-three-of-four rule, which is the exact defect it prevents.
    const SEAMS = [
        'buildMcpConfig',
        'installAiDefaultsMcpTools',
        'componentInstallationOrchestrator',
        'handleRegenerateAiFiles',
    ];

    it('CONTROL: the seam names are real symbols in src/', () => {
        for (const s of SEAMS) {
            const hits = execSync(`git grep -l ${s} -- src | wc -l`, {
                encoding: 'utf8',
                cwd: ROOT,
            }).trim();
            expect({ seam: s, found: Number(hits) > 0 }).toEqual({ seam: s, found: true });
        }
    });

    it('names every seam, and says how many there are', () => {
        for (const s of SEAMS) expect(CLAUDE_MD).toContain(s.toLowerCase());
        expect(CLAUDE_MD).toContain(`${SEAMS.length === 4 ? 'four' : String(SEAMS.length)} seams`);
    });
});

describe('the "hit every surface" list names every surface that exists', () => {
    // The list exists to stop a change landing on one path and missing the others.
    // A list that has itself gone stale does the opposite: it tells you that you
    // covered everything while omitting the surface added last month. So the eight
    // webview bundles it names are checked against the build config that defines
    // them, in both directions.
    const CONFIG = readFileSync(join(ROOT, 'esbuild.config.js'), 'utf8');
    const entries = (): string[] => {
        const block = CONFIG.split('WEBVIEW_ENTRIES')[1] ?? '';
        return [...block.slice(0, block.indexOf('};')).matchAll(/^\s{4}(\w+):\s*'/gm)].map(
            (m) => m[1]
        );
    };

    it('CONTROL: the entry map is found and has several entries', () => {
        expect(entries().length).toBeGreaterThan(3);
    });

    it('names each bundle entry, and states the right count', () => {
        const names = entries();
        for (const n of names) expect(CLAUDE_MD).toContain(n.toLowerCase());
        expect(CLAUDE_MD).toContain(
            `${names.length === 8 ? 'eight' : String(names.length)} webview bundles`
        );
    });
});

describe("the glossary's checkable facts match the code they describe", () => {
    // A glossary earns its keep by being RIGHT. This one already caught CLAUDE.md
    // calling `sample-data` an area when it is a step inside the Commerce strip —
    // a fact that had drifted with nothing to notice. The same drift will happen
    // to the glossary unless the checkable part of it is pinned, so it is.
    const AREAS_SRC = readFileSync(
        join(ROOT, 'src/features/project-creation/ui/steps/buildYourProjectAreas.ts'),
        'utf8'
    );
    const areaIds = (): string[] => {
        const block = AREAS_SRC.split('BUILD_AREA_DESCRIPTORS')[1] ?? '';
        return [...block.slice(0, block.indexOf('\n];')).matchAll(/id: '([a-z-]+)'/g)].map(
            (m) => m[1]
        );
    };

    it('CONTROL: the descriptor list is found and non-empty', () => {
        expect(areaIds().length).toBeGreaterThan(1);
    });

    it('names every Build-Your-Project area, and no others', () => {
        // The glossary states a COUNT in words plus the names. Both must hold, so
        // adding a fourth area fails here rather than silently making the doc wrong.
        const ids = areaIds();
        expect(ids).toEqual(['commerce', 'storefront', 'integrations']);
        for (const id of ids) expect(CLAUDE_MD).toContain(id);
        expect(CLAUDE_MD).toContain('three sub-steps');
    });

    it('does not describe sample-data as an area', () => {
        // The exact drift this check was born from.
        expect(CLAUDE_MD).not.toContain("area id `'sample-data'`");
    });
});

describe('CLAUDE.md and the handbook still agree on the rules they share', () => {
    it('CONTROL: both documents were read and are substantial', () => {
        // Without this, every assertion below passes vacuously on an empty read —
        // which is the exact failure shape these checks exist to catch.
        expect(CLAUDE_MD.length).toBeGreaterThan(5000);
        expect(HANDBOOK.length).toBeGreaterThan(5000);
    });

    it('every paired rule is still stated in BOTH documents', () => {
        expect({
            goneFromClaudeMd: PAIRED.filter((p) => !CLAUDE_MD.includes(p.claudeMd)).map(
                (p) => p.rule
            ),
            goneFromHandbook: PAIRED.filter((p) => !HANDBOOK.includes(p.handbook)).map(
                (p) => p.rule
            ),
        }).toEqual({ goneFromClaudeMd: [], goneFromHandbook: [] });
    });

    it('CONTROL: a probe that should not match, does not', () => {
        // Proves the assertion above is reading the documents rather than matching
        // everything — a substring check that always passes is not a check.
        expect(CLAUDE_MD.includes('a rule nobody has ever written down here')).toBe(false);
        expect(HANDBOOK.includes('a rule nobody has ever written down here')).toBe(false);
    });

    it('the convention count CLAUDE.md quotes matches the handbook scorecard', () => {
        // CLAUDE.md summarises the handbook's totals for a reader who will not open
        // it. That is a count written in prose, which this repo has watched rot in
        // four places today alone — so it is pinned to the handbook's own claim,
        // which is itself pinned to the callouts by handbook-links.test.ts.
        const raw = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
        const quoted = raw.match(/(\d+) of them, (\d+) with an enforcer/);
        expect(quoted).not.toBeNull();

        const hb = readFileSync(join(ROOT, 'docs/development/handbook.md'), 'utf8');
        const scorecard = hb.match(/states (\d+) conventions\. (\d+) of them are enforced/);
        expect(scorecard).not.toBeNull();

        expect({ total: quoted![1], enforced: quoted![2] }).toEqual({
            total: scorecard![1],
            enforced: scorecard![2],
        });
    });

    it('the handbook is the document CLAUDE.md points at for conventions', () => {
        // Structural: CLAUDE.md may restate a rule, but a reader who wants the full
        // set must be told where it lives, or the two drift into rival lists.
        expect(readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8')).toContain(
            'docs/development/handbook.md'
        );
    });
});
