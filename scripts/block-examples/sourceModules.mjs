/**
 * The extension's own modules the render check needs, compiled from `src/` with esbuild (the
 * repo's bundler) into one temporary file and imported. So the render check builds each example
 * page with the same `shippedExamplePage` the library build writes, reads each block's code
 * shape with the same `analyzeBlockCode`, and knows which repositories ship by release from the
 * same `RELEASED_REPOS`. Nothing here is re-implemented.
 */

import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { build } from 'esbuild';

const ENTRY = `
export {
    TEMPLATE_SOURCE,
    loadShippedBlockExamples,
    shippedExamplePage,
} from '@/features/eds/services/blockLibrary/shippedBlockExamples';
export { analyzeBlockCode } from '@/features/eds/services/blockLibrary/blockCode';
export { RELEASED_REPOS } from '@/core/releases/releasedRepos';
export { TIMEOUTS } from '@/core/utils/timeoutConfig';
export { default as blockLibraries } from '@/features/components/config/block-libraries.json';
export { default as demoPackages } from '@/features/components/config/demo-packages.json';
`;

/** Compiles and imports the modules; `root` is the repository root. */
export async function loadSourceModules(root) {
    const result = await build({
        stdin: { contents: ENTRY, resolveDir: root, loader: 'ts', sourcefile: 'render-inputs.ts' },
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
        tsconfig: join(root, 'tsconfig.json'),
        logLevel: 'error',
    });
    const file = join(mkdtempSync(join(tmpdir(), 'block-examples-modules-')), 'modules.mjs');
    writeFileSync(file, result.outputFiles[0].text);
    return import(pathToFileURL(file).href);
}
