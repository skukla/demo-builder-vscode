/**
 * Emit `fixtures.json` for the webview visual-snapshot harness.
 *
 * THIS FILE HOLDS NO SHAPES. Every payload comes from
 * `tests/helpers/webviewFixtures.ts`, which is TypeScript, typed to the real
 * interfaces in `src/types/`, and covered by `npm run typecheck:tests` — which
 * CI runs.
 *
 * That split is the whole point. An earlier version of this script defined the
 * payloads inline as untyped object literals, and five of them were invented
 * rather than read; each was caught only when a surface visibly broke. Every one
 * had an exported type that would have failed to compile.
 *
 * So the shapes live where the compiler reads them, and this file only wires
 * them to disk. Adding a payload here rather than there is opting back out of
 * the only check that works.
 *
 * Usage:  node build-fixtures.mjs <outDir>
 */

import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { build } from 'esbuild';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = join(HERE, '..', '..', '..');

const outDir = process.argv[2];
if (!outDir) {
    console.error('usage: node build-fixtures.mjs <outDir>');
    process.exit(1);
}

/**
 * Compile the typed fixture module and import it.
 *
 * esbuild is already a dependency; the `@/` alias is re-stated here so this
 * script stands alone rather than importing the build config.
 */
async function loadTypedFixtures() {
    const scratch = mkdtempSync(join(tmpdir(), 'wvfx-'));
    const outfile = join(scratch, 'fixtures.cjs');
    await build({
        entryPoints: [join(REPO, 'tests', 'helpers', 'webviewFixtures.ts')],
        outfile,
        bundle: true,
        platform: 'node',
        // CJS, not ESM: the fixture module uses `__dirname`, which exists under
        // jest (CommonJS) and not in ESM output. Bundling to CJS keeps the
        // module identical in both places rather than making it aware of how it
        // is being loaded.
        format: 'cjs',
        packages: 'external',
        logLevel: 'silent',
        alias: { '@': join(REPO, 'src') },
    });
    const mod = createRequire(import.meta.url)(outfile);
    rmSync(scratch, { recursive: true, force: true });
    return mod;
}

const fx = await loadTypedFixtures();

const { project, source } = fx.loadProjectFixture();
const componentsData = fx.loadRegistryFixture();
const wizardSteps = fx.loadWizardSteps();
const pushed = fx.buildPushedMessages(project);
const theme = 'dark';

// Init field lists come from each command's `getInitialData()` — the payload the
// real host sends. A surface rendering thin means this is missing something that
// command supplies; fix it here, never by lowering what the snapshot expects.
const init = {
    wizard: {
        theme,
        wizardSteps,
        componentDefaults: project.componentSelections,
        existingProjectNames: [project.name],
    },
    dashboard: { theme, project, hasMesh: false, projectName: project.title ?? project.name },
    configure: { theme, project, componentsData },
    sidebar: { theme, project, projectName: project.title ?? project.name, hasProject: true },
    projectsList: { theme, projects: [project], recentProjects: [project] },
    aiOverview: { theme, project, projectName: project.title ?? project.name },
    integrations: {
        theme,
        projectName: project.title ?? project.name,
        hasAdobeContext: Boolean(project.adobe?.organization),
        appBuilderComponents: project.appBuilderComponents,
        commerceStoreStructure: project.commerceStoreStructure,
    },
    dataInstaller: { theme, projectName: project.title ?? project.name },
};

// Answers to requests a surface makes on mount. Anything unlisted gets a benign
// `{success:true, data:null}`, which is enough for most and leaves the rest on a
// loading state — which is the tell that one belongs here.
const requests = {
    'get-components-data': { success: true, data: componentsData },
    // Nested under `data.projects` — read from projects-dashboard/ui/index.tsx.
    getProjects: { success: true, data: { projects: [project], projectsViewMode: 'cards' } },
};

writeFileSync(join(outDir, 'fixtures.json'), JSON.stringify({ init, requests, pushed }, null, 2));

console.log(`fixtures written for ${Object.keys(init).length} surfaces`);
console.log(`  project source:  ${source}`);
console.log(
    `  registry:        ${componentsData ? `${componentsData.frontends.length} frontends, ${componentsData.backends.length} backends` : 'MISSING'}`
);
console.log(`  wizard steps:    ${wizardSteps ? wizardSteps.length : 'MISSING'}`);
console.log(`  request answers: ${Object.keys(requests).join(', ')}`);
console.log(`  pushed messages: ${Object.keys(pushed).join(', ')}`);
console.log(`  shapes typed in: tests/helpers/webviewFixtures.ts (checked by typecheck:tests)`);
