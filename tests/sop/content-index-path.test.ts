/**
 * The content index path is stated once.
 *
 * Found live 2026-09-12: the probe that reads a colleague's demo and the copy
 * step that reads a brand's pages each spelled the default index path
 * themselves, so a site that publishes its index under another name read as
 * "no published pages" in one place while the catalog knew the name in the
 * other. Every reader now goes through `contentIndex.ts`; this suite fails the
 * build when a source file spells an index path on its own again, and checks
 * that the module's list still covers every path the shipped catalog names.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CONTENT_INDEX_PATHS } from '@/features/eds/services/contentIndex';
import demoPackages from '@/features/components/config/demo-packages.json';
import demoPackagesSchema from '@/features/components/config/demo-packages.schema.json';
import sharedDemoSchema from '@/core/state/config/shared-demo.schema.json';

const ROOT = join(__dirname, '..', '..');
const OWNER = 'src/features/eds/services/contentIndex.ts';
const INDEX_PATH = /['"`]\/(?:full-index|sitemap|query-index)\.json['"`]/;

function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const SOURCES = execSync("git ls-files 'src/**/*.ts' 'src/**/*.tsx'", { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);

describe('the content index path is stated once', () => {
    it('CONTROL: the owner module states the paths this suite looks for', () => {
        expect(INDEX_PATH.test(stripComments(readFileSync(join(ROOT, OWNER), 'utf8')))).toBe(true);
        expect(SOURCES.length).toBeGreaterThan(500);
    });

    it('no other source file spells an index path', () => {
        const offenders = SOURCES.filter(
            (file) => file !== OWNER && INDEX_PATH.test(stripComments(readFileSync(join(ROOT, file), 'utf8'))),
        );
        expect(offenders).toStrictEqual([]);
    });

    it('whoever names a content site names its index path: every catalog entry states one', () => {
        const unstated: string[] = [];
        for (const pkg of demoPackages.packages) {
            for (const [stack, storefront] of Object.entries(pkg.storefronts)) {
                const source = (storefront as { contentSource?: { indexPath?: string } }).contentSource;
                if (source && !source.indexPath) unstated.push(`${pkg.id}/${stack}`);
            }
        }
        expect(unstated).toStrictEqual([]);
    });

    it('both schemas require the path wherever a content site is named', () => {
        const catalogDef = demoPackagesSchema.definitions.daLiveContentSource as { required: string[] };
        expect(catalogDef.required).toContain('indexPath');
        const fileDef = (sharedDemoSchema as { definitions: Record<string, { required?: string[] }> }).definitions
            .DaLiveContentSource;
        expect(fileDef.required).toContain('indexPath');
    });

    it('the tried paths cover every index path the shipped catalog names', () => {
        const catalogPaths = new Set<string>();
        for (const pkg of demoPackages.packages) {
            for (const storefront of Object.values(pkg.storefronts)) {
                const path = (storefront as { contentSource?: { indexPath?: string } }).contentSource?.indexPath;
                if (path) catalogPaths.add(path);
            }
        }
        expect(catalogPaths.size).toBeGreaterThan(0);
        for (const path of catalogPaths) expect(CONTENT_INDEX_PATHS).toContain(path);
    });
});
