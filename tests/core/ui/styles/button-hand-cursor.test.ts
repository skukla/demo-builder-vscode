/**
 * Every enabled button shows the hand on hover, on every screen (owner, 2026-10-31).
 *
 * Spectrum's buttons keep the arrow by default while the extension's own dialog buttons show the
 * hand, so one dialog had both. `interaction.css` is the one rule, and it only works on a screen
 * whose entry imports it: a new webview that forgets it is back to the arrow, with no error
 * anywhere. This reads the real entry list from the build config.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..', '..');
/**
 * The entries, read from the build config's TEXT: requiring the config loads esbuild, which will
 * not run in this suite's browser-like environment.
 */
function webviewEntries(): Record<string, string> {
    const config = readFileSync(join(ROOT, 'esbuild.config.js'), 'utf8');
    const block = config.slice(config.indexOf('const WEBVIEW_ENTRIES = {'));
    const body = block.slice(0, block.indexOf('};'));
    return Object.fromEntries([...body.matchAll(/^\s*(\w+):\s*'([^']+)'/gm)].map((m) => [m[1], m[2]]));
}
const WEBVIEW_ENTRIES = webviewEntries();
const SHEET = 'src/core/ui/styles/interaction.css';

describe('every enabled button shows the hand', () => {
    it('CONTROL: the build lists the webview entries', () => {
        expect(Object.keys(WEBVIEW_ENTRIES).length).toBeGreaterThan(5);
    });

    it('the rule is in the theme layer, above Spectrum, and leaves a disabled button alone', () => {
        const css = readFileSync(join(ROOT, SHEET), 'utf8');
        expect(css).toMatch(/@layer theme\s*{[\s\S]*cursor:\s*pointer/);
        expect(css).toContain('button:not(:disabled)');
        expect(css).toContain(":not([aria-disabled='true'])");
    });

    it('every webview entry imports it', () => {
        const missing = Object.entries(WEBVIEW_ENTRIES)
            .filter(([, entry]) => !readFileSync(join(ROOT, entry), 'utf8').includes("import '@/core/ui/styles/interaction.css';"))
            .map(([name]) => name);
        expect(missing).toStrictEqual([]);
    });
});
