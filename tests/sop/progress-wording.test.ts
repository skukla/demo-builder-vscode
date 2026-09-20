/**
 * Progress notifications follow one wording (PL-59 phase 2,
 * `.rptc/plans/operation-progress/extension-wide.md`):
 *
 * - The TITLE is an "-ing" verb and its object, fixed for the whole run: "Deploying API
 *   Mesh". No trailing "…", "..." or ":" — VS Code's spinner already says it is
 *   working, and VS Code itself puts ": " between the title and the message.
 * - The MESSAGE is the stage name: 25 characters at most (VS Code draws title and
 *   message on one line of fixed width and cuts the rest off), no trailing "…", "...".
 * - Neither uses a "Step n/N" count; a count goes after the stage as "(1 of 2)".
 *
 * What breaks it today is listed in `progress-wording.ledger.json`, titles and
 * messages separately, and reworded slice by slice. Each list may only shrink: a NEW
 * offender fails, and one that was fixed but is still listed fails too, so the lists
 * cannot go stale.
 *
 * Not `modal-hosting.test.ts`, which checks that every modal is mounted in a host; this
 * checks what the notifications SAY. Stage names in the stage table are also held by
 * `operationStages.test.ts`. What this scan cannot see: a title or message built in a
 * variable and passed in, and a message handed to a reporter callback rather than to
 * `progress.report` — `withOperationProgress` sends only stage names, which the stage
 * table already caps.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { globSync } from 'glob';

interface Ledger {
    titles: Record<string, string>;
    messages: Record<string, string>;
}

const ROOT = join(__dirname, '..', '..');
const LEDGER: Ledger = JSON.parse(readFileSync(join(__dirname, 'progress-wording.ledger.json'), 'utf8'));
const MAX_MESSAGE = 25;

/**
 * `this.withProgress('Title', …)` and `withProgress({ … title: 'Title' …` — incl. the
 * register and `withOperationProgress`, the helper every operation now goes through.
 */
const TITLE_SITES = [
    /this\.withProgress\(\s*(['"`])(.*?)\1/gs,
    /with(?:Progress|ProgressRegister|OperationProgress)\(\s*\{[^}]*?\btitle:\s*(['"`])(.*?)\1/gs,
];
/** `progress.report({ message: 'Message' })` and every other `.report({ message:`. */
const MESSAGE_SITES = [/\.report\(\s*\{\s*message:\s*(['"`])(.*?)\1/gs];

function sites(patterns: readonly RegExp[]): Array<{ key: string; text: string }> {
    const out: Array<{ key: string; text: string }> = [];
    for (const file of globSync('src/**/*.ts', { cwd: ROOT })) {
        const source = readFileSync(join(ROOT, file), 'utf8');
        for (const pattern of patterns) {
            for (const match of source.matchAll(pattern)) {
                out.push({ key: `${file} | ${match[2]}`, text: match[2] });
            }
        }
    }
    return out;
}

/** The fixed words of a template: what the SC reads whatever the values. */
const staticText = (text: string): string => text.replace(/\$\{[^}]*\}/g, '').trim();

const ENDS_IN_ELLIPSIS = /(…|\.\.\.)\s*$/;
const STEP_COUNT = /Step (\d|\$\{)/;

function titleProblem(title: string): string | undefined {
    if (!/^(\$\{[^}]+\}\s*)?[A-Z][a-z]+ing\b/.test(title)) return 'does not start with an "-ing" verb';
    if (/(…|\.\.\.|:)\s*$/.test(title)) return 'ends in "…", "..." or ":"';
    if (STEP_COUNT.test(title)) return 'uses a "Step n/N" count';
    return undefined;
}

function messageProblem(message: string): string | undefined {
    if (staticText(message).length > MAX_MESSAGE) return `over ${MAX_MESSAGE} characters`;
    if (ENDS_IN_ELLIPSIS.test(message)) return 'ends in "…" or "..."';
    if (STEP_COUNT.test(message)) return 'uses a "Step n/N" count';
    return undefined;
}

const KINDS = [
    { kind: 'titles', patterns: TITLE_SITES, problem: titleProblem },
    { kind: 'messages', patterns: MESSAGE_SITES, problem: messageProblem },
] as const;

/**
 * The two modules that may render a running clock: the modal's own, and the
 * wizard's install-step detail, which has no modal to time it.
 */
const CLOCK_OWNERS = [
    'src/core/ui/hooks/useElapsedClock.ts',
    'src/core/utils/progressUnifier/ProgressUnifier.ts',
    'src/core/utils/timeFormatting.ts',
];

// One wait, one clock. Mesh deploy's step counted the seconds from when POLLING
// started, beside the modal's clock counting from when the STAGE started, so a
// deploy read "Waiting for Adobe — 1 second · 4 seconds" — two numbers for one
// wait, disagreeing (owner, 2026-09-20).
describe('a wait is timed once', () => {
    it('CONTROL: the clock exists and its owners are found', () => {
        const owners = CLOCK_OWNERS.filter((f) => existsSync(join(ROOT, f)));
        expect(owners).toEqual(CLOCK_OWNERS);
        expect(readFileSync(join(ROOT, CLOCK_OWNERS[0]), 'utf8')).toContain('formatElapsed');
    });

    it('is the SURFACE that counts, never a step it is narrating', () => {
        const counted = globSync('src/**/*.{ts,tsx}', { cwd: ROOT }).filter(
            (file) =>
                !CLOCK_OWNERS.includes(file) &&
                /formatElapsed\s*\(/.test(readFileSync(join(ROOT, file), 'utf8')),
        );

        expect(counted).toStrictEqual([]);
    });
});

describe('progress-notification wording', () => {
    it('CONTROL: the scans find what they are meant to read, and tell good from bad', () => {
        expect(sites(TITLE_SITES).map((s) => s.text)).toContain('Deploying API Mesh');
        expect(sites(TITLE_SITES).length).toBeGreaterThan(30);
        // The floor FALLS as operations move onto `withOperationProgress`, which
        // reports stage names from the table instead of writing a message here:
        // 30 -> 20 when the resets and the delete moved (PL-59 slices 2 and 3).
        // It still has to find a real corpus, or the scan above proves nothing.
        expect(sites(MESSAGE_SITES).length).toBeGreaterThan(20);
        expect(titleProblem('Deploying API Mesh')).toBeUndefined();
        expect(titleProblem('Demo Builder')).toBeDefined();
        // Deliberately BAD examples: they prove the scan can tell. A wording
        // pass that "fixes" these blinds the control (caught 2026-09-20).
        expect(titleProblem('Loading GitHub repositories...')).toBeDefined();
        expect(messageProblem('Deploying the app')).toBeUndefined();
        expect(messageProblem('Pushing to GitHub…')).toBeDefined();
        expect(messageProblem('Someone else changed the storefront')).toBeDefined();
        expect(messageProblem('Step ${p.step}/${p.total}: ${p.message}')).toBeDefined();
    });

    describe.each(KINDS)('$kind', ({ kind, patterns, problem }) => {
        const found = sites(patterns);
        const listed = LEDGER[kind];

        it('CONTROL: the list for this kind was read', () => {
            expect(Object.keys(listed).length).toBeGreaterThan(0);
        });

        it('none new breaks the wording', () => {
            const offending = found
                .filter((s) => problem(s.text) && !(s.key in listed))
                .map((s) => `${s.key} — ${problem(s.text)}`);

            expect(offending).toStrictEqual([]);
        });

        it('lists only what still breaks it (fix one, delete its line)', () => {
            const current = new Set(found.map((s) => s.key));
            const stale = Object.keys(listed).filter(
                (key) => !current.has(key) || !problem(key.slice(key.indexOf(' | ') + 3)),
            );

            expect(stale).toStrictEqual([]);
        });

        it('gives every listed one a reason', () => {
            const unexplained = Object.entries(listed)
                .filter(([, reason]) => reason.trim().length < 20)
                .map(([key]) => key);

            expect(unexplained).toStrictEqual([]);
        });
    });
});
