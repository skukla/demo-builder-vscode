/**
 * Action doors, complete — every entry point a person or an agent can use is assigned.
 *
 * WHY THIS EXISTS. `action-doors.test.ts` checks the doors of the actions its ledger
 * lists. That made the sign-in drift impossible to repeat for those 21 actions and did
 * nothing for any other: an action nobody had audited could grow a second door that
 * re-decides its policy, and nothing would fail, because nothing knew the action
 * existed. The owner's ask (2026-11-18): the conventions catch everything, not only
 * what someone thought to list.
 *
 * HOW. `entryPointScan.ts` reads every entry point out of `src/`: each webview message
 * type (every handler map, followed through spreads and registrations; every direct
 * `comm.on`; the sidebar), each VS Code command (`registerCommand` and package.json),
 * each MCP tool. `action-doors.entry-points.json` must assign every one, either to the
 * action rows it reaches or to a bucket that says why it needs none. Both directions: an
 * unassigned entry point fails, and so does an assignment whose entry point is gone.
 *
 * Beside it, two comparisons the audit asked for that a door list alone cannot make:
 * a declared read placed among writes (or the reverse), and one message type answered
 * by different implementations in different maps.
 *
 * @see tests/templates/action-doors.test.ts — the doors of each action row
 * @see .claude/skills/call-path-audit/SKILL.md — how a new entry point is assigned
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { ALL_FILES, ROOT, stripComments } from '../sop/architectureScan';
import { toolDeclarations } from '../sop/tool.testUtils';
import { ENTRY_POINTS, LEDGER } from './actionDoorsScan';
import {
    commandIds,
    entryId,
    handlerMaps,
    handlerOrigin,
    handlerSites,
    objectKeys,
} from './entryPointScan';

type Sources = Map<string, string>;

const SOURCES: Sources = new Map(
    ALL_FILES.map((f) => [
        f.replace(/^src\//, ''),
        stripComments(readFileSync(join(ROOT, f), 'utf8')),
    ])
);
const CONTRIBUTED: string[] = (
    JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
        contributes: { commands: { command: string }[] };
    }
).contributes.commands.map((c) => c.command);

/** A tool, split by form: a descriptor row dispatches into a handler type. */
const TOOLS = toolDeclarations().map((d) => ({
    ...d,
    type: d.body.startsWith('tool:') ? /\btype:\s*'([^']+)'/.exec(d.body)?.[1] : undefined,
    readOnly: /\b(?:readOnly|readOnlyHint):\s*(true|false)/.exec(d.body)?.[1],
}));

/** Every entry point in these sources, as `kind:name`. Descriptor tools ride their type. */
function enumerate(sources: Sources, tools = TOOLS): string[] {
    return [
        ...[...handlerSites(sources).keys()].map((t) => entryId('handler', t)),
        ...commandIds(sources, CONTRIBUTED).ids.map((c) => entryId('command', c)),
        ...tools.filter((t) => !t.type).map((t) => entryId('tool', t.name)),
    ].sort();
}

const ASSIGNED: string[] = [
    ...Object.values(ENTRY_POINTS.buckets).flatMap((b) => b.members),
    ...Object.keys(ENTRY_POINTS.forwards),
    ...Object.keys(ENTRY_POINTS.actions),
];
const ENUMERATED = enumerate(SOURCES);
const unassigned = (entries: string[]): string[] => entries.filter((e) => !ASSIGNED.includes(e));

describe('entry points: the enumerator', () => {
    it('CONTROL: reads keys, skips spreads, and follows a spread and a registered map', () => {
        expect(objectKeys("'a-b': h1, c, d(x) {}, ...more, e: (x) => f(x, y)")).toStrictEqual([
            { key: 'a-b', value: 'h1' },
            { key: 'c', value: 'c' },
            { key: 'd', value: 'd' },
            { key: 'e', value: '(x) => f(x, y)' },
        ]);
        const planted: Sources = new Map([
            ['a/handlers.ts', "export const aHandlers = defineHandlers({ 'x-one': h, ...extra });"],
            ['a/extra.ts', 'export const extra = { spreadIn: h2 };'],
            ['b/panel.ts', 'protected handlerMaps() { return [plainMap, missing]; }'],
            ['b/plain.ts', "const plainMap: HandlerMap = { 'plain-type': h3 };"],
        ]);
        const { maps, unresolved } = handlerMaps(planted);
        expect(maps.flatMap((m) => m.entries.map((e) => e.key)).sort()).toStrictEqual([
            'plain-type',
            'spreadIn',
            'x-one',
        ]);
        // A registered name with no definition is reported, never silently skipped.
        expect(unresolved).toStrictEqual(['missing']);
    });

    it('CONTROL: resolves a command constant and reports one it cannot resolve', () => {
        const planted: Sources = new Map([
            ['c.ts', "const OPEN_CMD = 'demoBuilder.planted'; registerCommand(OPEN_CMD, f);"],
            ['d.ts', "registerCommand('demoBuilder.literal', g); registerCommand(LOST_CMD, h);"],
        ]);
        expect(commandIds(planted, ['demoBuilder.fromPackage'])).toStrictEqual({
            ids: ['demoBuilder.fromPackage', 'demoBuilder.literal', 'demoBuilder.planted'],
            unresolved: ['LOST_CMD'],
        });
    });

    it('CONTROL: finds known entry points of every kind in src/', () => {
        for (const known of [
            'handler:authenticate',
            'handler:switchOrg',
            'handler:setCommerceConfig', // spread in from setupHandlerMap
            'handler:takeClearRequest', // a panel's handlerMaps()
            'handler:save-configuration', // a direct comm.onStreaming
            'handler:openAiChat', // the sidebar
            'command:demoBuilder.signInAdobe',
            'command:demoBuilder.showBuildInfo', // a constant id
            'tool:sign_in',
        ]) {
            expect(ENUMERATED).toContain(known);
        }
        // A descriptor tool is its handler type, not an entry of its own.
        expect(TOOLS.find((t) => t.name === 'save_demo_package')?.type).toBeUndefined();
        expect(TOOLS.find((t) => t.name === 'deploy_mesh')?.type).toBe('deploy-api-mesh');
        expect(ENUMERATED.length).toBeGreaterThan(350);
    });

    it('every handler map and command id it meets resolves (a map it cannot read fails here)', () => {
        expect(handlerMaps(SOURCES).unresolved).toStrictEqual([]);
        expect(commandIds(SOURCES, CONTRIBUTED).unresolved).toStrictEqual([]);
    });
});

describe('entry points: every one is assigned', () => {
    it('PLANTED: a new handler type and a new tool nobody assigned are reported', () => {
        const planted = new Map(SOURCES);
        planted.set(
            'features/x/handlers/planted.ts',
            "export const xHandlers = defineHandlers({ 'planted-type': handlePlanted });"
        );
        const tool = {
            name: 'planted_tool',
            file: 'x',
            body: "registerTool('planted_tool'",
            type: undefined,
            readOnly: undefined,
        };
        expect(unassigned(enumerate(planted, [...TOOLS, tool]))).toStrictEqual([
            'handler:planted-type',
            'tool:planted_tool',
        ]);
    });

    it('every entry point in src/ is assigned to an action, a forward or a bucket', () => {
        expect(unassigned(ENUMERATED)).toStrictEqual([]);
    });

    it('every assignment names an entry point that still exists, once', () => {
        expect(ASSIGNED.filter((e) => !ENUMERATED.includes(e))).toStrictEqual([]);
        expect(ASSIGNED.filter((e, i) => ASSIGNED.indexOf(e) !== i)).toStrictEqual([]);
    });

    it('every descriptor tool dispatches into a handler type that exists', () => {
        const types = new Set(handlerSites(SOURCES).keys());
        const broken = TOOLS.filter((t) => t.type && !types.has(t.type)).map((t) => t.name);
        expect(broken).toStrictEqual([]);
    });

    it('assignments name real action rows, every row is reached, and buckets say why', () => {
        const rows = Object.keys(LEDGER.actions);
        const named = Object.values(ENTRY_POINTS.actions).flat();
        expect(named.filter((a) => !rows.includes(a))).toStrictEqual([]);
        expect(rows.filter((r) => !named.includes(r))).toStrictEqual([]);
        const silent = Object.entries(ENTRY_POINTS.buckets).filter(([, b]) => !b.why.trim());
        expect(silent).toStrictEqual([]);
    });

    it('a forward runs an entry point that exists, named in the file that registers it', () => {
        const sites = handlerSites(SOURCES);
        const filesOf = (entry: string): string[] => {
            const [kind, name] = [
                entry.slice(0, entry.indexOf(':')),
                entry.slice(entry.indexOf(':') + 1),
            ];
            if (kind === 'handler') return [...(sites.get(name)?.keys() ?? [])];
            return TOOLS.filter((t) => t.name === name).map((t) => t.file.replace(/^src\//, ''));
        };
        const wrong = Object.entries(ENTRY_POINTS.forwards).filter(([from, to]) => {
            if (!ENUMERATED.includes(to)) return true;
            const id = to.startsWith('command:') ? to.slice('command:'.length) : undefined;
            return (
                id !== undefined && !filesOf(from).some((f) => SOURCES.get(f)?.includes(`'${id}'`))
            );
        });
        expect(wrong).toStrictEqual([]);
    });

    it('every drift row is on an assigned entry point', () => {
        expect(Object.keys(ENTRY_POINTS.drift).filter((e) => !ASSIGNED.includes(e))).toStrictEqual(
            []
        );
    });
});

describe('entry points: doors compared', () => {
    /** What an entry point's own declarations say: 'true' read-only, 'false' writes. */
    const declared = (entry: string): string[] => {
        const name = entry.slice(entry.indexOf(':') + 1);
        if (entry.startsWith('tool:'))
            return TOOLS.filter((t) => t.name === name).flatMap((t) => t.readOnly ?? []);
        if (entry.startsWith('handler:'))
            return TOOLS.filter((t) => t.type === name).flatMap((t) => t.readOnly ?? []);
        return [];
    };
    const mixed = (entry: string): boolean =>
        entry.startsWith('handler:') && entry.slice('handler:'.length) in ENTRY_POINTS.sharedNames;

    it('CONTROL: the declared flag is read for both tool forms', () => {
        expect(declared('tool:get_auth_status')).toContain('true');
        expect(declared('handler:deploy-api-mesh')).toStrictEqual(['false']);
    });

    it('a `read` entry point declares no write, and a declared read is not filed as a write', () => {
        const reads = ENTRY_POINTS.buckets.read.members;
        const writes = [
            ...ENTRY_POINTS.buckets.write.members,
            ...Object.keys(ENTRY_POINTS.actions),
        ];
        expect({
            readsThatWrite: reads.filter((e) => declared(e).includes('false')),
            writesThatRead: writes.filter(
                (e) => !mixed(e) && declared(e).length > 0 && declared(e).every((f) => f === 'true')
            ),
        }).toStrictEqual({ readsThatWrite: [], writesThatRead: [] });
    });

    /** Message types whose maps give them more than one implementation. */
    function sharedNameTypes(sources: Sources): string[] {
        return [...handlerSites(sources)]
            .filter(([type, byFile]) => {
                const origins = [...byFile]
                    .map(([f, v]) => handlerOrigin(f, sources.get(f) ?? '', type, v))
                    .filter((o) => !o.startsWith('ref:'));
                return new Set(origins).size > 1;
            })
            .map(([type]) => type)
            .sort();
    }

    it('PLANTED: one type given two implementations is caught; a borrowed handler is not', () => {
        const planted: Sources = new Map([
            [
                'p/a.ts',
                "import { handleGo } from './goA';\nexport const aH = defineHandlers({ go: handleGo, same: handleSame });",
            ],
            [
                'p/b.ts',
                "import { handleGo } from './goB';\nimport { handleSame } from './a';\nexport const bH = defineHandlers({ go: handleGo, same: aH['same'] });",
            ],
        ]);
        expect(sharedNameTypes(planted)).toStrictEqual(['go']);
    });

    it('a message type several maps implement differently is listed with why (both directions)', () => {
        const found = sharedNameTypes(SOURCES);
        const listed = Object.keys(ENTRY_POINTS.sharedNames).sort();
        expect(found).toContain('cancel'); // control: three screens' own Cancel
        expect({
            unlisted: found.filter((t) => !listed.includes(t)),
            stale: listed.filter((t) => !found.includes(t)),
        }).toStrictEqual({ unlisted: [], stale: [] });
    });
});
