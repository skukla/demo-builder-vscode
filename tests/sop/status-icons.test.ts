/**
 * SOP: one status icon on every surface. Owner, 2026-11-02: the wizard's iconography, standardized
 * across the wizard and all the dialogs. A triangle had meant "needs you" in a dialog and "failed" on
 * the sign-in step, chosen file by file with no rule.
 *
 * Read from the source, because webview suites mock these icons and a mock cannot see this.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', '..', 'src');

/** Files that draw one of these icons themselves, each with why that is right. */
const LEDGER: Record<string, string> = {
    'core/ui/components/feedback/StatusIcon.tsx': 'It is the one that draws them.',
    'core/ui/components/feedback/InlineNotice.tsx': "A banner's outline icons, coloured by the banner's tone.",
    'core/ui/components/forms/FieldHelpButton.tsx': 'A help button, not a status.',
    'core/ui/components/timelineNav.helpers.tsx': 'A white check on a filled step marker, not a status colour.',
};

const STATUS_ICONS = /@spectrum-icons\/workflow\/(Alert|AlertCircle|CheckmarkCircle|CloseCircle|InfoOutline)'/;

function sources(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return sources(full);
        return entry.name.endsWith('.tsx') ? [full] : [];
    });
}

const relative = (file: string) => path.relative(SRC, file).split(path.sep).join('/');

describe('one status icon on every surface', () => {
    const drawn = sources(SRC)
        .filter((file) => STATUS_ICONS.test(fs.readFileSync(file, 'utf8')))
        .map(relative)
        .sort();

    it('only the listed files draw a status icon themselves', () => {
        expect(drawn).toEqual(Object.keys(LEDGER).sort());
    });

    it('no surface uses the triangle: the wizard set has none', () => {
        const triangles = sources(SRC).filter((file) =>
            /@spectrum-icons\/workflow\/Alert'/.test(fs.readFileSync(file, 'utf8')),
        );

        expect(triangles).toStrictEqual([]);
    });

    it("keeps the wizard's set: each status on its own icon", () => {
        // From the source: the suites' shared icon stub draws every icon alike.
        const source = fs.readFileSync(path.join(SRC, 'core/ui/components/feedback/StatusIcon.tsx'), 'utf8');
        const iconFor = (status: string) => new RegExp(`case '${status}':\\s+return <(\\w+)`).exec(source)?.[1];

        expect({
            warning: iconFor('warning'),
            error: iconFor('error'),
            success: iconFor('success'),
            info: iconFor('info'),
        }).toEqual({
            warning: 'AlertCircle',
            error: 'CloseCircle',
            success: 'CheckmarkCircle',
            info: 'InfoOutline',
        });
    });

    it('a warning and an error are different shapes: colour alone is not enough', () => {
        const source = fs.readFileSync(path.join(SRC, 'core/ui/components/feedback/StatusIcon.tsx'), 'utf8');
        const iconFor = (status: string) => new RegExp(`case '${status}':\\s+return <(\\w+)`).exec(source)?.[1];

        expect(iconFor('warning')).not.toBe(iconFor('error'));
    });

    it('a dialog puts its outcome in its title: the large centred icon is for a whole screen', () => {
        const big = sources(SRC)
            .filter((file) => {
                const text = fs.readFileSync(file, 'utf8');
                return /<Modal\b/.test(text) && /<(StatusDisplay|SuccessStateDisplay)\b/.test(text);
            })
            .map(relative)
            .sort();

        expect(big).toStrictEqual([]);
    });

    // Owner, 2026-11-02: "I just want all colors to be consistent". One set, Spectrum's own status
    // colours, so a colour scale value cannot drift in beside them.
    it('status colours come from Spectrum\'s status tokens, never its colour scale', () => {
        const css = (dir: string): string[] =>
            fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) return css(full);
                return entry.name.endsWith('.css') ? [full] : [];
            });
        const scale = /--spectrum-global-color-(red|orange|yellow|green)-\d+/;
        const classes = /\btext-(red|orange|yellow|green)-\d+\b/;

        const offenders = [
            ...css(SRC).filter((file) => scale.test(fs.readFileSync(file, 'utf8'))),
            ...sources(SRC).filter((file) => classes.test(fs.readFileSync(file, 'utf8'))),
        ].map(relative);

        expect(offenders).toStrictEqual([]);
    });

    it('CONTROL: the check still finds what it looks for', () => {
        expect(drawn).toContain('core/ui/components/feedback/StatusIcon.tsx');
        expect(STATUS_ICONS.test("import Alert from '@spectrum-icons/workflow/Alert';")).toBe(true);
    });
});
