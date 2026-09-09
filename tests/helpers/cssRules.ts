/**
 * Read a CSS rule out of the shipped stylesheets, wherever it currently lives.
 *
 * NOT a duplicate of anything in this directory — checked 2026-09-09: no helper
 * here touches CSS at all. The two Spectrum-named files are component-prop stubs
 * (`spectrumStubProps`, `integrationCardSpectrumMocks`) and `webviewFixtures`
 * holds message payloads. This is the first stylesheet reader.
 *
 * WHY IT EXISTS. Six suites had each written their own `ruleFor`, and twelve read
 * stylesheets by hand. Every one named the sheets it expected a rule to be in,
 * which meant they asserted on where a rule LIVED as much as on what it SAID — and
 * the CSS migration (`.rptc/plans/css-architecture-migration/`) moves rules between
 * sheets by design. Three suites broke on moves that changed no rendering at all
 * before this existed.
 *
 * So this reads EVERY stylesheet under `src/`. A rule found is a rule that ships;
 * which file holds it is not a fact worth pinning in a layout test.
 *
 * TWO PREPROCESSING STEPS, both load-bearing:
 *
 * 1. **Comments are stripped**, or a commented-out rule would be found and
 *    asserted on.
 * 2. **`@layer` wrappers are stripped.** `ruleFor` splits on `}` and reads the text
 *    before the next `{` as the selector, so a rule sitting FIRST inside
 *    `@layer theme { ... }` reads as `@layer theme` and goes invisible — exactly
 *    one rule per migrated sheet, which is how `.ai-capabilities-body` disappeared
 *    while its four `::-webkit-scrollbar` siblings were still found. Removing the
 *    wrapper changes no declaration.
 *
 * **Do not use this to assert cascade ORDER or layer membership.** It deliberately
 * destroys both. `tests/core/ui/styles/layerDeclarations.test.ts` owns those
 * questions and reads the raw file itself.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '../../src');

/** Every stylesheet under `src/`, recursively. */
function stylesheets(dir: string = SRC): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...stylesheets(full));
        else if (entry.name.endsWith('.css')) out.push(full);
    }
    return out;
}

/** How many sheets were read, so a suite can assert the corpus is plausible. */
export const sheetCount: number = stylesheets().length;

/** All shipped CSS, comments and layer wrappers removed. Computed once. */
export const allCss: string = stylesheets()
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@layer\s+[\w.-]+\s*\{/g, '');

/**
 * The declaration block for an exact selector list, from any shipped sheet.
 *
 * Throws when nothing matches, naming the selector: a missing rule is a real
 * finding and must never read as an empty assertion.
 */
export function ruleFor(selectorList: string, css: string = allCss): string {
    const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
    for (const block of css.split('}')) {
        const open = block.indexOf('{');
        if (open === -1) continue;
        if (norm(block.slice(0, open)) === norm(selectorList)) return block.slice(open);
    }
    throw new Error(`no rule for: ${selectorList}`);
}

/** The px number of a single-valued declaration inside a rule body. */
export function pxOf(body: string, property: string): number {
    const m = new RegExp(`(?:^|[;{])\\s*${property}\\s*:\\s*(-?[\\d.]+)px`).exec(body);
    if (!m) throw new Error(`no px value for ${property} in: ${body.slice(0, 80)}`);
    return Number(m[1]);
}

/** Does a rule declare a property at all, whatever its value? */
export function declares(body: string, property: string): boolean {
    return new RegExp(`(?:^|[;{])\\s*${property}\\s*:`).test(body);
}
