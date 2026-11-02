/**
 * SOP: a dialog that is waiting shows nothing else.
 *
 * Owner, 2026-11-01: "nothing on the modal should show when a spinner is running. We've had to
 * deal with this multiple times." The title, a medium centred spinner and the way out appear, and
 * `Modal`'s `waiting` prop does it, so a file that renders a Modal has no reason to draw its own
 * spinner in the body. A button's own work is `isPending`, which this does not touch.
 *
 * Read from the source because every webview suite mocks `Modal`, and a mock cannot see this.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', '..', 'src');

/** Files that render a Modal and draw a wait in its body, each with why that is right. */
const LEDGER: Record<string, string> = {
    'features/data-installer/ui/components/ClearDemoDataModal.tsx':
        'A re-check after a tick shows its spinner where the answer lands (owner, 2026-10-31). The first read uses `waiting`.',
    'features/eds/ui/siteAccess/SiteAccessScreen.tsx': "The screen's own wait, not one inside its dialog.",
};

function sources(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return sources(full);
        return entry.name.endsWith('.tsx') ? [full] : [];
    });
}

const relative = (file: string) => path.relative(SRC, file).split(path.sep).join('/');

function offenders(): string[] {
    return sources(SRC)
        .filter((file) => {
            const text = fs.readFileSync(file, 'utf8');
            return /<Modal\b/.test(text) && /<(LoadingDisplay|ProgressCircle|Spinner)\b/.test(text);
        })
        .map(relative)
        .sort();
}

/** A wait with its own words, or the large spinner that belongs to a whole screen. */
const FLYOUT_WAIT_TOO_MUCH = /<LoadingDisplay\b[^>]*(size="L"|message="[^"]+")/;

function flyoutOffenders(): string[] {
    return sources(SRC)
        .filter((file) => {
            const text = fs.readFileSync(file, 'utf8');
            return /<Drawer\b/.test(text) && FLYOUT_WAIT_TOO_MUCH.test(text);
        })
        .map(relative)
        .sort();
}

describe('a dialog that is waiting shows nothing else', () => {
    it('a flyout waits the same way: its title and a medium spinner, with no words', () => {
        expect(flyoutOffenders()).toStrictEqual([]);
    });

    it('CONTROL: the flyout check finds both ways of getting it wrong, and passes the right one', () => {
        expect(FLYOUT_WAIT_TOO_MUCH.test('<LoadingDisplay size="L" message="" />')).toBe(true);
        expect(FLYOUT_WAIT_TOO_MUCH.test('<LoadingDisplay size="M" message="Loading datapack" />')).toBe(true);
        expect(FLYOUT_WAIT_TOO_MUCH.test('<LoadingDisplay size="M" centered message="" />')).toBe(false);
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

    it('CONTROL: still finds the thing it looks for', () => {
        expect(fs.readFileSync(path.join(SRC, 'core/ui/components/ui/Modal.tsx'), 'utf8')).toMatch(/<LoadingDisplay\b/);
    });
});
