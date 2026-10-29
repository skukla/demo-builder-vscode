/**
 * A tool must remove work, not add vocabulary the agent has to guess (AI-1l).
 *
 * Every closed list a tool's input accepts — `z.enum`, `z.literal`, `z.nativeEnum` — is a
 * new way for a CORRECT request to be refused. Measured 2026-08-26: `run_commerce_query`
 * took an `endpoint` enum, and in nine runs the agent's first query was right every time
 * and assembled by hand before the tool existed. The enum refused its correct reading
 * ("catalogService") five times; the agent abandoned a right query, introspected the
 * schema, and came back to where it began. curl had never had that failure.
 *
 * So a closed list is a decision, and this records each one with its reason: why the set
 * is the agent's own vocabulary (our screens, our states, an HTTP verb) and not a name for
 * something the agent knows by another. A new one fails until it is reasoned here; one
 * that is gone fails until its row is deleted.
 *
 * Keyed by file and the declaring line's TEXT, not its number: line numbers in this repo
 * move daily, and a renamed list is a new decision anyway.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const SERVER_DIR = 'src/features/ai/server';
// The tool surface lives in these two places; the other tool scans read the same pair.
const FILES = [
    ...readdirSync(join(ROOT, SERVER_DIR))
        .filter((f) => f.endsWith('.ts'))
        .map((f) => `${SERVER_DIR}/${f}`),
    'src/mcp-server.ts',
];
const LEDGER: Record<string, string> = JSON.parse(
    readFileSync(join(__dirname, 'tool-input-constraints.ledger.json'), 'utf8'),
).constraints;

const CLOSED_LIST = /z\.(enum|literal|nativeEnum)\(/;

/** Every line declaring a closed list, as `file: line text`. */
export function closedLists(files: Array<{ file: string; source: string }>): string[] {
    const found: string[] = [];
    for (const { file, source } of files) {
        for (const line of source.split('\n')) {
            if (CLOSED_LIST.test(line)) found.push(`${file}: ${line.trim()}`);
        }
    }
    return found.sort();
}

describe('a closed list in a tool input is a reasoned decision', () => {
    const current = closedLists(FILES.map((file) => ({ file, source: readFileSync(join(ROOT, file), 'utf8') })));

    it('CONTROL: the scan finds closed lists, and finds a planted one', () => {
        expect(current.length).toBeGreaterThan(5);
        expect(closedLists([{ file: 'x.ts', source: "    endpoint: z.enum(['catalog', 'core']),\n" }])).toEqual([
            "x.ts: endpoint: z.enum(['catalog', 'core']),",
        ]);
    });

    it('every closed list is in the ledger with a reason, and every row still exists', () => {
        const listed = Object.keys(LEDGER);
        expect({
            newWithoutAReason: current.filter((k) => !listed.includes(k)),
            goneButStillListed: listed.filter((k) => !current.includes(k)),
            reasonsMissing: listed.filter((k) => !LEDGER[k]?.trim()),
        }).toEqual({ newWithoutAReason: [], goneButStillListed: [], reasonsMissing: [] });
    });
});
