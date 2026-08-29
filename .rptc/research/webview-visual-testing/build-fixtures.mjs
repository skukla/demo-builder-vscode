/**
 * Build the init payloads each webview surface needs to render something real.
 *
 * WHY THIS EXISTS. The snapshot instrument (PL-21 phase 1) proved all eight
 * surfaces MOUNT, but four of them rendered almost nothing under a trivial
 * `{theme:'dark'}` init: wizard 8 elements, configure 5, sidebar 15,
 * aiOverview 5. An "IDENTICAL" verdict on a surface with five elements is not
 * evidence of anything, and auditing ADR-018 showed exactly that problem — the
 * surfaces that stayed clean through the layer change were the surfaces with the
 * least rendered.
 *
 * SHAPES ARE READ, NOT INVENTED (ADR-016 rule 3). Every payload below is derived
 * from something real:
 *
 *   - the project comes from a REAL manifest on disk when one is present
 *     (`~/.demo-builder/projects/<name>/.demo-builder.json`), falling back to the
 *     canonical `tests/helpers/projectFake.ts` shape
 *   - wizard steps come from `src/features/project-creation/config/wizard-steps.json`
 *   - the component registry comes from `src/features/components/config/components.json`
 *
 * The field lists come from each command's `getInitialData()`, which is what the
 * real host sends. Where a payload here omits something the command sends, the
 * surface will render less than production does — which is a fixture gap, and
 * the reason `report.json` records what each surface produced.
 *
 * Usage:  node build-fixtures.mjs <outDir>
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const outDir = process.argv[2];
if (!outDir) {
    console.error('usage: node build-fixtures.mjs <outDir>');
    process.exit(1);
}

/** A real manifest if this machine has one; otherwise the canonical shape. */
function realProject() {
    const root = join(homedir(), '.demo-builder', 'projects');
    if (existsSync(root)) {
        for (const name of readdirSync(root)) {
            const manifest = join(root, name, '.demo-builder.json');
            if (existsSync(manifest)) {
                const project = JSON.parse(readFileSync(manifest, 'utf8'));
                // The ON-DISK manifest is NOT the in-memory `Project`. The loader
                // adds fields the file does not store because they are implied by
                // where it lives — `path` chiefly, and `status`. Without `path`
                // the projects list never leaves "Loading projects…", which is
                // how this was found.
                project.path ??= join(root, name);
                project.status ??= 'ready';
                return { project, source: `real manifest: ${name} (+ loader-derived path/status)` };
            }
        }
    }
    // Mirrors tests/helpers/projectFake.ts, which was itself copied from a real
    // manifest. Kept in sync by hand; if they drift, the real one above wins on
    // any machine that has a project.
    return {
        source: 'canonical projectFake shape (no manifest on this machine)',
        project: {
            name: 'demo-project',
            title: 'Demo Project',
            path: '/projects/demo',
            version: '1.0.0',
            formatVersion: 2,
            created: '2026-01-01T00:00:00.000Z',
            lastModified: '2026-01-01T00:00:00.000Z',
            status: 'ready',
            adobe: {
                organization: '285361',
                organizationName: 'Acme Demo Org',
                authenticated: true,
                projectId: '4566206088345738527',
                projectName: 'AcmeDemo',
                workspace: 'workspace-123',
                workspaceName: 'Stage',
            },
            componentSelections: {
                frontend: 'eds-storefront',
                backend: 'adobe-commerce-accs',
                dependencies: [],
                integrations: [],
                appBuilder: [],
            },
            components: ['eds-storefront'],
            componentInstances: {
                'eds-storefront': {
                    id: 'eds-storefront',
                    name: 'EDS Storefront',
                    type: 'frontend',
                    status: 'ready',
                    port: 3000,
                    path: '/projects/demo/components/eds-storefront',
                },
            },
            componentConfigs: {},
            componentVersions: {},
        },
    };
}

function readJson(rel) {
    const p = join(REPO, rel);
    return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

const { project, source } = realProject();
const wizardSteps = readJson('src/features/project-creation/config/wizard-steps.json');
const registry = readJson('src/features/components/config/components.json');

/**
 * The registry as `ComponentRegistryManager.loadRegistry()` hands it out.
 *
 * The raw JSON stores each category as an object KEYED BY ID; consumers expect
 * an ARRAY of `{...definition, id}`. Passing the raw shape crashes the configure
 * surface with `frontends?.find is not a function` — which is how this was
 * found, and a second instance of the same lesson: the file's shape on disk is
 * not the shape the UI receives.
 */
function transformRegistry(raw) {
    if (!raw) return undefined;
    const toArray = (section) =>
        Object.entries(raw[section] ?? {}).map(([id, def]) => ({ ...def, id }));
    return {
        frontends: toArray('frontends'),
        backends: toArray('backends'),
        dependencies: toArray('dependencies'),
        integrations: toArray('integrations'),
        mesh: toArray('mesh'),
        appBuilder: toArray('appBuilder'),
    };
}

const componentsData = transformRegistry(registry);

const theme = 'dark';

/**
 * Field lists taken from each command's `getInitialData()`.
 * A surface rendering thin here means its payload is missing something that
 * command sends — fix it here, not by lowering what the snapshot expects.
 */
const fixtures = {
    // createProject.ts — needs the step list or it renders "Configuration Error"
    wizard: {
        theme,
        wizardSteps: wizardSteps?.steps ?? wizardSteps,
        componentDefaults: project.componentSelections,
        existingProjectNames: ['demo-project'],
    },

    // showDashboard.ts
    dashboard: {
        theme,
        project,
        hasMesh: false,
        projectName: project.title ?? project.name,
    },

    // configure.ts — needs the registry, or the form has nothing to render
    configure: {
        theme,
        project,
        componentsData,
    },

    // the sidebar builds its own context rather than using the shared client
    // (ADR-017 §4 / PL-19) — this mirrors the SidebarContext type
    sidebar: {
        theme,
        project,
        projectName: project.title ?? project.name,
        hasProject: true,
    },

    // projects-dashboard
    projectsList: {
        theme,
        projects: [project],
        recentProjects: [project],
    },

    // openAi.ts
    aiOverview: {
        theme,
        project,
        projectName: project.title ?? project.name,
    },

    // showIntegrations.ts
    integrations: {
        theme,
        projectName: project.title ?? project.name,
        hasAdobeContext: Boolean(project.adobe?.organization),
        appBuilderComponents: project.appBuilderComponents,
        commerceStoreStructure: project.commerceStoreStructure,
    },

    // showDataInstaller.ts
    dataInstaller: {
        theme,
        projectName: project.title ?? project.name,
    },
};

/**
 * Answers for specific requests a surface makes on mount.
 *
 * The harness answers anything unlisted with `{success:true, data:null}`, which
 * is enough for most surfaces and NOT enough for these — the wizard times out on
 * `get-components-data` and renders its error state.
 */
const requests = {
    'get-components-data': { success: true, data: componentsData },
    // Shape read from projects-dashboard/ui/index.tsx:50-55 — the list is nested
    // under `data.projects`, not `data`. A bare array leaves it on "Loading
    // projects…" forever.
    getProjects: {
        success: true,
        data: { projects: [project], projectsViewMode: 'cards' },
    },
};

/**
 * PUSHED messages — sent unprompted after init, or in reply to a plain
 * postMessage that expects no response.
 *
 * Two surfaces need these and neither uses request/response:
 *
 *  - the SIDEBAR does not use the shared client at all (ADR-017 §4 / PL-19). It
 *    posts `getContext` and waits for a `contextResponse` carrying
 *    `data.context`. Shape from `src/features/sidebar/types.ts:18`.
 *
 * NOTE THE TWO ENVELOPES, which is itself evidence for PL-19. The sidebar reads
 * the RAW `event.data`, so its reply carries a `data` field. Everything else
 * goes through WebviewClient, which hands `message.payload` to the callback — so
 * those replies carry `payload`. Using `data` for a client-routed message
 * delivers `undefined` to the handler and crashed the dashboard and integrations
 * surfaces to an empty root ("Cannot read properties of undefined").
 *  - INTEGRATIONS renders "Loading integrations…" while
 *    `hasAdobeContext && !projectStatus` (IntegrationsScreen.tsx:195), and
 *    `projectStatus` arrives as a pushed `statusUpdate`
 *    (useDashboardStatus.ts:152) after a `requestStatus` postMessage.
 */
const pushed = {
    getContext: {
        type: 'contextResponse',
        data: { context: { type: 'project', project } },
    },
    // Shape read from `DashboardStatusUpdatePayload`
    // (src/types/webviewPayloads.ts:246). An INVENTED shape here — `{projectName,
    // components}` — crashed both the dashboard and the integrations surface to
    // an empty root, 72 elements down to 4. Third instance in this file of the
    // same lesson: read the type, do not infer it from the field you happen to
    // want.
    requestStatus: {
        type: 'statusUpdate',
        payload: {
            name: project.title ?? project.name,
            path: project.path ?? '/projects/demo',
            status: project.status ?? 'ready',
            frontendConfigChanged: false,
            adobeOrg: project.adobe?.organizationName,
            adobeProject: project.adobe?.projectName,
            edsStorefrontStatus: project.edsStorefrontStatusSummary,
        },
    },
};

writeFileSync(join(outDir, 'fixtures.json'), JSON.stringify({ init: fixtures, requests, pushed }, null, 2));
console.log(`fixtures written for ${Object.keys(fixtures).length} surfaces`);
console.log(`  project source: ${source}`);
console.log(`  wizard steps:   ${wizardSteps ? (wizardSteps.steps?.length ?? '?') + ' steps' : 'MISSING'}`);
console.log(`  registry:       ${componentsData ? componentsData.frontends.length + ' frontends, ' + componentsData.backends.length + ' backends (transformed to arrays)' : 'MISSING'}`);
console.log(`  request answers: ${Object.keys(requests).join(', ')}`);
console.log(`  pushed messages: ${Object.keys(pushed).join(', ')}`);
