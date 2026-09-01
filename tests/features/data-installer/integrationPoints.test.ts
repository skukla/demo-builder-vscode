/**
 * The four seams that make the Data Installer REACHABLE.
 *
 * The feature is 37 source files, and every one of them can be present and
 * correct while the surface is entirely unreachable. What connects it to the
 * extension is four edits to files that belong to other areas:
 *
 *   1. `esbuild.config.js`  — the webview entry, or the bundle is never built
 *   2. `package.json`       — the command contribution, or the palette has no entry
 *   3. `commandManager.ts`  — the registration, or the command id resolves to nothing
 *   4. `readDescriptors.ts` — the six MCP reads, or no agent can see the catalog
 *
 * All four went missing at once and nothing failed. The feature was removed from
 * develop before beta.129 (`c0d0f2fc`), and rebasing this branch onto that could
 * not restore them: the commits that ADDED them were merged to develop as Stage
 * 1, so they live in shared history rather than in this branch's commits.
 * Replaying commits cannot re-create an edit no commit makes.
 *
 * The verification that missed it compared FILE COUNTS — 37 before, 37 after —
 * which cannot see lines removed from files that still exist. Whole files were
 * restored and these were not, and the suite stayed green throughout, because
 * every unit test exercises the feature's own modules and none of them asks
 * whether anything can reach it.
 *
 * So this asserts reachability directly, at the seams, from the files
 * themselves.
 */

import * as fs from 'fs';
import * as path from 'path';
import { READ_DESCRIPTORS } from '@/features/ai/server/readDescriptors';
import { dataInstallerHandlers } from '@/features/data-installer/handlers/dataInstallerHandlers';

const ROOT = path.resolve(__dirname, '../../../');

function read(relative: string): string {
    return fs.readFileSync(path.join(ROOT, relative), 'utf-8');
}

const COMMAND_ID = 'demoBuilder.showDataInstaller';

describe('Data Installer integration points', () => {
    it('builds a webview bundle', () => {
        const config = read('esbuild.config.js');

        expect(config).toMatch(/dataInstaller:\s*'src\/features\/data-installer\/ui\/index\.tsx'/);
    });

    it('contributes the palette command', () => {
        const pkg = JSON.parse(read('package.json'));
        const ids = pkg.contributes.commands.map((c: { command: string }) => c.command);

        expect(ids).toContain(COMMAND_ID);
    });

    it('registers that command, so the id resolves to something', () => {
        const manager = read('src/commands/commandManager.ts');

        expect(manager).toContain('ShowDataInstallerCommand');
        expect(manager).toContain(COMMAND_ID);
    });

    /**
     * Six READS and no writes. Datapack authoring is deliberately withheld — the
     * catalog is shared infrastructure, `delete-datapack` cascades, and there is
     * no undo and no ownership guard, so one agent typo removes a colleague's
     * demo.
     */
    it('exposes the six MCP reads', () => {
        const rows = READ_DESCRIPTORS.filter((d) => d.map === dataInstallerHandlers);

        expect(rows).toHaveLength(6);
    });

    /**
     * Asserted on the descriptors' `type` values, not on the file's text. A raw
     * string search fails here for the wrong reason: the module's own comment
     * NAMES `delete-datapack` while explaining why it is withheld, so the search
     * cannot tell a wired tool from prose about one.
     */
    it('exposes no datapack WRITE to agents', () => {
        const types = READ_DESCRIPTORS.filter((d) => d.map === dataInstallerHandlers).map(
            (d) => d.type,
        );

        for (const forbidden of [
            'start-datapack-import',
            'reset-datapack',
            'start-datapack-export',
            'create-datapack',
            'delete-datapack',
        ]) {
            expect(types).not.toContain(forbidden);
        }
        // Control: the filter found rows at all, so an empty `types` cannot be
        // what makes the loop above pass.
        expect(types.length).toBeGreaterThan(0);
    });

    /**
     * Positive control. Every assertion above is "this string is in that file",
     * which passes just as well against a file that is empty, misnamed or
     * unreadable. This proves the reader is actually reading.
     */
    it('reads real files — control for the assertions above', () => {
        expect(read('package.json').length).toBeGreaterThan(1000);
        expect(read('esbuild.config.js')).toContain('WEBVIEW_ENTRIES');
        expect(() => read('src/features/data-installer/does-not-exist.ts')).toThrow();
    });
});
