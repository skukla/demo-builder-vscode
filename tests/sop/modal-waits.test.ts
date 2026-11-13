/**
 * SOP: a dialog that is waiting shows nothing else, and says what it is waiting for.
 *
 * Owner, 2026-11-01: "nothing on the modal should show when a spinner is running. We've had to
 * deal with this multiple times." The title, the wait and the way out appear, and `Modal`'s
 * `waiting` prop does it, so a file that renders a Modal has no reason to draw its own spinner in
 * the body. A button's own work is `isPending`, which this does not touch.
 *
 * Owner, 2026-11-08 (walk F72): the wait says what it is doing, in the progress window's three rows
 * (`StageWait`, words from `WAIT_STAGES`). A wordless spinner sat for a minute over a re-import's
 * comparison. `Modal`'s `waiting` takes a label by type; a wait drawn outside it (a flyout's) is
 * checked here.
 *
 * Read from the source because every webview suite mocks `Modal`, and a mock cannot see this.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', '..', 'src');

/** Files that render a Modal and draw a wait in its body, each with why that is right. */
const LEDGER: Record<string, string> = {};

function sources(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return sources(full);
        return entry.name.endsWith('.tsx') ? [full] : [];
    });
}

const relative = (file: string) => path.relative(SRC, file).split(path.sep).join('/');

/**
 * A dialog: `Modal`, or the Steps layout that renders one in its place (its waits come from
 * Modal's `waiting` too). The other layouts are left out because a screen that hosts one usually
 * has a wait of its own outside it (Site Access's list).
 */
const RENDERS_DIALOG = /<(Modal|StepsDialog|StepsWindow)\b/;

/** A dialog that draws a wait of its own in its body. */
const drawsOwnWait = (text: string): boolean => RENDERS_DIALOG.test(text) && /<(LoadingDisplay|ProgressCircle|Spinner)\b/.test(text);

function offenders(): string[] {
    return sources(SRC)
        .filter((file) => drawsOwnWait(fs.readFileSync(file, 'utf8')))
        .map(relative)
        .sort();
}

/** A wait with no words: the shape every dialog and flyout wait had until 2026-11-08. */
const WORDLESS_WAIT = /<LoadingDisplay\b[^>]*message=(""|\{''\})/;

function wordlessWaits(): string[] {
    return sources(SRC)
        .filter((file) => WORDLESS_WAIT.test(fs.readFileSync(file, 'utf8')))
        .map(relative)
        .sort();
}

describe('a dialog that is waiting shows nothing else', () => {
    it('no wait anywhere is wordless: a dialog or flyout wait says what it is doing', () => {
        expect(wordlessWaits()).toStrictEqual([]);
    });

    it('CONTROL: the wordless check finds both spellings, and passes a wait with words', () => {
        expect(WORDLESS_WAIT.test('<LoadingDisplay size="M" centered message="" />')).toBe(true);
        expect(WORDLESS_WAIT.test("<LoadingDisplay message={''} />")).toBe(true);
        expect(WORDLESS_WAIT.test('<LoadingDisplay size="M" message="Loading activity" />')).toBe(false);
    });

    it('draws no wait of its own in a Modal: Modal takes `waiting`', () => {
        expect(offenders()).toEqual(Object.keys(LEDGER).sort());
    });

    it('centres the wait both ways, and keeps it clear of the rule and the buttons', () => {
        const css = fs.readFileSync(path.join(SRC, 'core/ui/styles/modal.css'), 'utf8');
        const rule = /\.modal-wait \{([^}]*)\}/.exec(css)?.[1] ?? '';
        // Measured in a browser, 2026-11-01: 40 above and below a bare spinner, 0 off-centre.
        expect(rule).toMatch(/align-items: center/);
        expect(rule).toMatch(/justify-content: center/);
        expect(rule).toMatch(/padding-top: 8px/);
    });

    // The ledger emptied on 2026-11-13 (step 06, C2a: Clear Demo Data lost its re-check spinner), so the
    // control no longer leans on a real offender: the scan reads the tree, and the test finds the shape.
    it('CONTROL: still finds the thing it looks for, and Modal waits with the house rows', () => {
        expect(fs.readFileSync(path.join(SRC, 'core/ui/components/ui/Modal.tsx'), 'utf8')).toMatch(/<StageWait\b/);
        expect(sources(SRC).filter((file) => RENDERS_DIALOG.test(fs.readFileSync(file, 'utf8'))).length).toBeGreaterThan(5);
        expect(drawsOwnWait('<Modal title="x"><Spinner size="S" aria-label="Reading" /></Modal>')).toBe(true);
        expect(drawsOwnWait('<Modal title="x" waiting="Reading" />')).toBe(false);
    });
});
