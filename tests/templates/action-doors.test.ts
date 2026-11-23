/**
 * Action doors — every user action is entered through the doors its ledger lists, and no
 * others.
 *
 * WHY THIS EXISTS. `spine-chokepoints.test.ts` pinned where each action's bottom call
 * lives, and its header used to say entry points "may multiply freely". Adobe sign-in
 * passed that pin for months while seven callers above it each re-decided its mode
 * (F248). The 2026-11-18 audit then read 30 actions and found 13 more whose doors
 * disagree about policy: the agent's reset skips the org check, two GitHub sign-ins
 * store a narrower token, creation's datapack install skips validation. Nothing counted
 * doors, so nothing failed.
 *
 * WHAT IT CHECKS, per ledger row (`action-doors.ledger.json`):
 *  - both directions: a file calling the entry that the ledger does not list fails (a
 *    new door), and a listed door that no longer calls it fails (a stale row);
 *  - the mode rule: a door passing an argument the spine decides fails, unless the row
 *    says why it may;
 *  - `mustRead`: a door that ignores a spine result field handing it a job fails;
 *  - bypasses: a file recorded as doing the job WITHOUT the entry that now calls it fails;
 *  - agent-only handlers: a descriptor type no webview sends needs a ledger reason.
 *
 * Known drift is written down as an exemption naming its fix, not hidden, and the count
 * of exemptions only falls.
 *
 * @see .rptc/research/entry-point-drift-audit/research.md — the audit this seeds from
 * @see .claude/skills/call-path-audit/SKILL.md — where a new door is audited
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { ALL_FILES, ROOT, stripComments } from '../sop/architectureScan';
import {
    callersOf,
    diffDoors,
    DOOR_VERDICTS,
    ENTRY_POINTS,
    entryCalls,
    isSpine,
    LEDGER,
    modeArguments,
    shouldFields,
    type ActionRow,
} from './actionDoorsScan';

/** Every src file, comment-stripped, keyed src-relative (the ledger's spelling). */
const SOURCES = new Map(
    ALL_FILES.map((f) => [
        f.replace(/^src\//, ''),
        stripComments(readFileSync(join(ROOT, f), 'utf8')),
    ])
);
const ROWS = Object.entries(LEDGER.actions);
const codeOf = (file: string): string => SOURCES.get(file) ?? '';

/**
 * A mustRead row's problems: doors that skip a field without a `doesNotRead` (or carry
 * one and read it anyway), and a field no door reads at all, which means a wrong name.
 */
function mustReadProblems(
    row: Pick<ActionRow, 'mustRead' | 'doors'>,
    read: (file: string) => string
): string[] {
    const fields = row.mustRead ?? [];
    const unreal = fields.filter((f) => !Object.keys(row.doors).some((d) => read(d).includes(f)));
    const wrong = Object.entries(row.doors)
        .filter(
            ([file, door]) =>
                fields.every((f) => read(file).includes(f)) === Boolean(door.doesNotRead)
        )
        .map(([file]) => file);
    return [...unreal.map((f) => `no door reads ${f}`), ...wrong];
}

describe('action doors: the scanner', () => {
    const row: Pick<ActionRow, 'entry' | 'spine'> = {
        entry: '\\brepublishThing\\(',
        spine: ['svc/'],
    };
    const planted = new Map([
        [
            'svc/republish.ts',
            'export async function republishThing(x) { return republishThing(x - 1); }',
        ],
        ['ui/button.ts', 'await republishThing({ id });'],
        ['ai/tool.ts', 'const r = await republishThing({ id, force: true });'],
        ['ai/mention.ts', stripComments('// republishThing( used to be called here\nconst a = 1;')],
        ['ai/definesOnly.ts', 'export function republishThing(y) {}'],
    ]);

    it('CONTROL: finds a planted new door and a stale row, and skips spine, comments and definitions', () => {
        const callers = callersOf(planted, row);
        expect(callers).toStrictEqual(['ai/tool.ts', 'ui/button.ts']);
        // The ledger lists the button and a door that moved away; the tool is new.
        expect(diffDoors(callers, ['ui/button.ts', 'ui/gone.ts'])).toStrictEqual({
            newDoors: ['ai/tool.ts'],
            staleDoors: ['ui/gone.ts'],
        });
    });

    it('CONTROL: the mode rule catches a planted mode argument and passes a clean call', () => {
        const signIn = LEDGER.actions['adobe-sign-in'];
        const rule = signIn.modeRule!;
        expect(
            modeArguments('const ok = await authManager.login(true);', signIn.entry, rule)
        ).toHaveLength(1);
        expect(
            modeArguments('await a.loginAndRestoreProjectContext(ctx, force);', signIn.entry, rule)
        ).toHaveLength(1);
        expect(
            modeArguments(
                'await authManager.loginAndRestoreProjectContext(ctx);',
                signIn.entry,
                rule
            )
        ).toHaveLength(0);
        // Nested calls inside the arguments stay inside the arguments.
        const reset = LEDGER.actions['storefront-reset'];
        const nested =
            'await resetEdsProjectWithUI({ project: pick(a, b), verifyCdn: true }); f(verifyCdn);';
        expect(modeArguments(nested, reset.entry, reset.modeRule!)).toHaveLength(1);
        expect(
            entryCalls('resetEdsProjectWithUI({ project: pick(a, b) }); f(verifyCdn);', reset.entry)
        ).toStrictEqual(['{ project: pick(a, b) }']);
    });

    it('CONTROL: the GitHub mode rule catches a door that prompts, and passes a silent read', () => {
        const gh = LEDGER.actions['github-sign-in'];
        const prompting =
            "await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });";
        const forcing = "getSession('github', SCOPES, { forceNewSession: true })";
        const silent = "getSession('github', SCOPES, { createIfNone: false, silent: true })";
        expect(modeArguments(prompting, gh.entry, gh.modeRule!)).toHaveLength(1);
        expect(modeArguments(forcing, gh.entry, gh.modeRule!)).toHaveLength(1);
        expect(modeArguments(silent, gh.entry, gh.modeRule!)).toHaveLength(0);
        // The lookahead keeps another provider's session out of the row.
        expect(entryCalls("getSession('microsoft', [], {})", gh.entry)).toStrictEqual([]);
    });

    it('CONTROL: shouldFields finds a planted should* result field and nothing else', () => {
        const planted = [
            'export interface TeardownResult {',
            '    success: boolean;',
            '    shouldClearSelection?: boolean;',
            '    shouldNotify: boolean;',
            '}',
            'const shouldRun = true;',
        ].join('\n');
        expect(shouldFields(planted)).toStrictEqual(['shouldClearSelection', 'shouldNotify']);
    });

    it('CONTROL: the corpus is real and every file the ledger names exists', () => {
        expect(SOURCES.size).toBeGreaterThan(500);
        const named = ROWS.flatMap(([, r]) => [
            ...r.spine.filter((s) => !s.endsWith('/')),
            ...Object.keys(r.doors),
            ...Object.keys(r.bypasses ?? {}),
        ]);
        expect(named.filter((f) => !SOURCES.has(f))).toStrictEqual([]);
    });
});

describe('action doors: the ledger against src/', () => {
    it.each(ROWS)('%s: exactly the ledger doors call the entry (both directions)', (_, row) => {
        // Positive control in the same assertion: `staleDoors` empty means every listed
        // door was found, so a renamed entry cannot pass on empty air.
        expect(Object.keys(row.doors).length).toBeGreaterThan(0);
        expect(diffDoors(callersOf(SOURCES, row), Object.keys(row.doors))).toStrictEqual({
            newDoors: [],
            staleDoors: [],
        });
    });

    it.each(ROWS.filter(([, r]) => r.modeRule))(
        '%s: no door passes a mode the spine decides',
        (_, row) => {
            const unexplained: string[] = [];
            const stale: string[] = [];
            for (const [file, door] of Object.entries(row.doors)) {
                const passes = modeArguments(codeOf(file), row.entry, row.modeRule!).length > 0;
                if (passes && !door.decidesMode) unexplained.push(file);
                // Drift debt goes stale when paid; a standing permission does not.
                if (!passes && door.decidesMode && door.verdict === 'drift') stale.push(file);
            }
            expect({ unexplained, stale }).toStrictEqual({ unexplained: [], stale: [] });
        }
    );

    it('every door of a mustRead row reads the result fields that hand it a job', () => {
        // No row has a mustRead today: the one field, shouldClearConsoleSelection, moved
        // into the spine (PL-104 fix 8). The planted control below keeps the check honest
        // until a spine hands a door a job again, which the next test forces into a row.
        const problems = ROWS.filter(([, r]) => r.mustRead).flatMap(([id, r]) =>
            mustReadProblems(r, codeOf).map((p) => `${id}: ${p}`)
        );
        expect(problems).toStrictEqual([]);
    });

    it('CONTROL: mustReadProblems catches a door that ignores the field and an unreal field', () => {
        const code = new Map([
            ['a.ts', 'if (r.shouldClear) clear();'],
            ['b.ts', 'return r.success;'],
        ]);
        const read = (f: string): string => code.get(f) ?? '';
        const doors = {
            'a.ts': { verdict: 'one-door', reason: 'x' },
            'b.ts': { verdict: 'one-door', reason: 'y' },
        };
        expect(mustReadProblems({ mustRead: ['shouldClear'], doors }, read)).toStrictEqual([
            'b.ts',
        ]);
        expect(
            mustReadProblems(
                {
                    mustRead: ['shouldClear'],
                    doors: { ...doors, 'b.ts': { ...doors['b.ts'], doesNotRead: 'why' } },
                },
                read
            )
        ).toStrictEqual([]);
        expect(mustReadProblems({ mustRead: ['shouldGone'], doors }, read)).toStrictEqual([
            'no door reads shouldGone',
            'a.ts',
            'b.ts',
        ]);
    });

    it('every should* field a spine declares is a mustRead of a row whose spine holds it', () => {
        // Audit enforcement 3: a `should*` result field hands the door a job, so some row
        // must make its doors read it. Controls: the planted shouldFields test above, and
        // the spine set is read (the one field it had, shouldClearConsoleSelection, moved
        // into the spine with PL-104 fix 8, so it cannot be the control).
        const spineFiles = [...SOURCES.keys()].filter((f) =>
            ROWS.some(([, r]) => isSpine(f, r.spine))
        );
        const owed = spineFiles.flatMap((file) =>
            shouldFields(codeOf(file))
                .filter(
                    (field) =>
                        !ROWS.some(([, r]) => isSpine(file, r.spine) && r.mustRead?.includes(field))
                )
                .map((field) => `${file}: ${field}`)
        );
        expect(spineFiles.length).toBeGreaterThan(20);
        expect(owed).toStrictEqual([]);
    });

    it('a recorded bypass still bypasses (move it to doors once it calls the entry)', () => {
        const nowCalling = ROWS.flatMap(([id, row]) =>
            Object.keys(row.bypasses ?? {})
                .filter((file) => entryCalls(codeOf(file), row.entry).length > 0)
                .map((file) => `${id}: ${file}`)
        );
        expect(nowCalling).toStrictEqual([]);
    });
});

describe('action doors: the exemptions', () => {
    const doors = ROWS.flatMap(([id, row]) =>
        Object.entries(row.doors).map(([file, d]) => ({ id, file, ...d }))
    );
    const exempt = doors.filter((d) => d.verdict === 'drift' || d.verdict === 'lead');
    const bypasses = ROWS.flatMap(([, row]) => Object.values(row.bypasses ?? {}));
    const agentOnlyRows = Object.entries(LEDGER.agentOnlyHandlers);
    const agentOnlyDebt = agentOnlyRows.filter(([, h]) => h.fix !== undefined).map(([, h]) => h);
    const entryDrift = Object.values(ENTRY_POINTS.drift);

    it('every door has a known verdict and a reason; every exemption names its fix', () => {
        const verdicts: readonly string[] = DOOR_VERDICTS;
        expect(
            doors
                .filter((d) => !verdicts.includes(d.verdict) || !d.reason.trim())
                .map((d) => d.file)
        ).toStrictEqual([]);
        const unfixed = [...exempt, ...bypasses, ...entryDrift].filter((e) => !e.fix?.trim());
        expect(unfixed).toStrictEqual([]);
    });

    it('every agent-only handler is debt (a fix) or on purpose (byDesign), never both or neither', () => {
        const unclear = agentOnlyRows
            .filter(([, h]) => !h.reason.trim() || Boolean(h.fix?.trim()) === (h.byDesign === true))
            .map(([type]) => type);
        expect(unclear).toStrictEqual([]);
    });

    it('the number of exemptions only falls', () => {
        const count = exempt.length + bypasses.length + agentOnlyDebt.length + entryDrift.length;
        const ceiling = LEDGER.exemptionCeiling;
        // Above: a new exemption; fix it instead. Below: lower the pin so it cannot grow back.
        expect({
            count,
            verdict: count > ceiling ? 'GREW' : count < ceiling ? 'LOWER_THE_PIN' : 'at',
        }).toStrictEqual({
            count: ceiling,
            verdict: 'at',
        });
    });
});

describe('action doors: handlers only an agent reaches', () => {
    const DESCRIPTORS = [
        'features/ai/server/actionDescriptors.ts',
        'features/ai/server/dataInstallerDescriptors.ts',
    ];
    const types = DESCRIPTORS.flatMap((f) =>
        [...codeOf(f).matchAll(/^\s*type:\s*'([^']+)'/gm)].map((m) => m[1])
    );
    const webview = [...SOURCES]
        .filter(([f]) => /(^|\/)ui\//.test(f))
        .map(([, code]) => code)
        .join('\n');
    const sentByWebview = (type: string): boolean =>
        ["'", '"', '`'].some((q) => webview.includes(`${q}${type}${q}`));
    const agentOnly = types.filter((t) => !sentByWebview(t)).sort();

    it('CONTROL: reads the descriptors and the webviews', () => {
        expect(types.length).toBeGreaterThan(50);
        expect(sentByWebview('renameProject')).toBe(true);
        expect(sentByWebview('deploy-api-mesh')).toBe(false);
    });

    it('every agent-only handler is in the ledger, and every ledger row is still agent-only', () => {
        const listed = Object.keys(LEDGER.agentOnlyHandlers).sort();
        expect(diffDoors(agentOnly, listed)).toStrictEqual({ newDoors: [], staleDoors: [] });
    });
});
