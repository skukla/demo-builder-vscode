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

/** Rules that colour with a status ICON token, each an icon's (owner, 2026-11-05). */
const ICON_COLOUR_SELECTORS: Record<string, string> = {
    '.copyable-icon-copied': 'The copy button\'s check icon.',
    '.inline-notice--success .inline-notice-icon': "A banner's icon.",
    '.inline-notice-icon': "A banner's icon.",
    '.integration-panel-action.is-danger .integration-panel-action-icon': "A danger action's icon.",
    'body [color="positive"]': "Spectrum's own components given a `color` prop: its icons and status lights.",
    'body [color="negative"]': "Spectrum's own components given a `color` prop: its icons and status lights.",
    'body [color="notice"]': "Spectrum's own components given a `color` prop: its icons and status lights.",
    '.dashboard-action-button--danger svg': "A danger tile's icon; its label takes the text token.",
    '.intflow-api-summary-remove:hover': 'The remove glyph (x) on an API row.',
};

/**
 * The accent blue keeps its ramp (rest, hover, pressed, selected each its own shade, a design
 * choice), and each state keeps ONE shade everywhere (owner, 2026-11-05). A focus ring is found by
 * its selector; the rest cannot be, so each rule is listed with the state it draws.
 */
const FOCUS_RING_SHADE = 400;
const ACCENT_STATES: Record<string, { state: string; property: string; shade: number }> = {
    '.expandable-brand-card.selected': { state: 'selected card border', property: 'border-color', shade: 400 },
    '.choice-card[data-selected="true"]': { state: 'selected card border', property: 'border-color', shade: 400 },
    '.datapack-card.is-selected': { state: 'selected card border', property: 'border-color', shade: 400 },
    '.sample-data-none.is-selected': { state: 'selected card border', property: 'border-color', shade: 400 },
    '.inline-action-link': { state: 'link', property: 'color', shade: 500 },
    '.service-action-link': { state: 'link', property: 'color', shade: 500 },
    '.brand-card-detail-link': { state: 'link', property: 'color', shade: 500 },
    '.clickable-url': { state: 'link', property: 'color', shade: 500 },
    '.choice-card[data-selected="true"]:hover': { state: 'selected card on hover', property: 'background', shade: 200 },
};

/** Each rule as its selector and declarations, comments removed. */
function rulesOf(css: string): Array<{ selector: string; body: string }> {
    const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
    return [...plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
        selector: selector.trim().replace(/\s+/g, ' '),
        body,
    }));
}

/** The blue shade a declaration of `property` takes in `body`, if it takes one. */
function blueOf(body: string, property: string): number | undefined {
    const declaration = new RegExp(`(^|[;\\s])${property}:[^;]*--spectrum-global-color-blue-(\\d+)`).exec(body);
    return declaration ? Number(declaration[2]) : undefined;
}

/** Focus rules whose blue outline is not the focus ring's shade. */
function offFocusRings(css: string): string[] {
    return rulesOf(css)
        .filter(({ selector, body }) => /:focus/.test(selector) && (blueOf(body, 'outline') ?? FOCUS_RING_SHADE) !== FOCUS_RING_SHADE)
        .map(({ selector }) => selector);
}

/** Every stylesheet under src, joined. */
function allCss(dir: string = SRC): string {
    return fs.readdirSync(dir, { withFileTypes: true }).map((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return allCss(full);
        return entry.name.endsWith('.css') ? fs.readFileSync(full, 'utf8') : '';
    }).join('\n');
}

/** The selectors of rules whose `color` (not border or background) is a status icon token. */
function iconTokenColourSelectors(css: string): string[] {
    const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
    return [...plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, , body]) => /(^|[;{\s])color:\s*var\(--spectrum-semantic-\w+-color-icon\)/.test(body))
        .map(([, selector]) => selector.trim().replace(/\s+/g, ' '));
}

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

    // Owner, 2026-11-05: consistency first, so Spectrum's own split, applied to every status: an
    // icon, dot or border takes `-color-icon`, text takes `-color-text-small`. Red's icon token was
    // 4.40:1 as text on the dialog, under AA's 4.5. A rule colouring something with an icon token
    // must be an icon's, listed here with what it colours.
    it("colours status text with Spectrum's text token, and only icons with its icon token", () => {
        const found = iconTokenColourSelectors(allCss());

        expect(found.filter((selector) => !(selector in ICON_COLOUR_SELECTORS))).toStrictEqual([]);
        expect(Object.keys(ICON_COLOUR_SELECTORS).filter((selector) => !found.includes(selector))).toStrictEqual([]);
    });

    it('CONTROL: the text-token check sees a planted text rule and passes an icon one', () => {
        expect(iconTokenColourSelectors('.a-note { color: var(--spectrum-semantic-negative-color-icon); }')).toStrictEqual(['.a-note']);
        expect(iconTokenColourSelectors('.a-ring { border-color: var(--spectrum-semantic-negative-color-icon); }')).toStrictEqual([]);
        expect(iconTokenColourSelectors('.a-note { color: var(--spectrum-semantic-negative-color-text-small); }')).toStrictEqual([]);
    });

    it('draws every focus ring in one blue', () => {
        const rings = rulesOf(allCss()).filter(({ selector, body }) => /:focus/.test(selector) && blueOf(body, 'outline'));

        // Positive control on the real tree: there were 19 when this was written.
        expect(rings.length).toBeGreaterThan(15);
        expect(offFocusRings(allCss())).toStrictEqual([]);
    });

    it('draws each listed accent state in its one shade', () => {
        const rules = rulesOf(allCss());
        const wrong = Object.entries(ACCENT_STATES).flatMap(([selector, want]) => {
            const rule = rules.find((candidate) => candidate.selector === selector);
            const shade = rule ? blueOf(rule.body, want.property) : undefined;
            return shade === want.shade ? [] : [`${selector} (${want.state}): blue-${shade ?? 'none'}, wants blue-${want.shade}`];
        });

        expect(wrong).toStrictEqual([]);
    });

    it('CONTROL: the shade checks see a planted odd focus ring and an odd link', () => {
        expect(offFocusRings('.x:focus-visible { outline: 2px solid var(--spectrum-global-color-blue-500); }')).toStrictEqual(['.x:focus-visible']);
        expect(offFocusRings('.x:focus-visible { outline: 2px solid var(--spectrum-global-color-blue-400); }')).toStrictEqual([]);
        expect(blueOf('color: var(--spectrum-global-color-blue-600);', 'color')).toBe(600);
        expect(blueOf('border-color: var(--spectrum-global-color-blue-600);', 'color')).toBeUndefined();
    });

    it('CONTROL: the check still finds what it looks for', () => {
        expect(drawn).toContain('core/ui/components/feedback/StatusIcon.tsx');
        expect(STATUS_ICONS.test("import Alert from '@spectrum-icons/workflow/Alert';")).toBe(true);
    });
});
