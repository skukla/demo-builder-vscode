/**
 * A file sent to someone else cannot point the new project at the sender's cloud
 * resources (owner, 2026-11-18). The wizard half of the enforcer.
 *
 * The classification is `src/types/projectFileOwnership.ts`, typed so an
 * unclassified field is a compile error. This suite proves the classification is
 * OBEYED: a project file whose every `sendersOwn` field holds a sentinel is read
 * through the real reader (`readProjectFile`), opened by the real wizard
 * (`useWizardState`) and turned into the real creation wire (`buildProjectConfig`).
 * No sentinel may land in either, except where a row below says why.
 *
 * The one sanctioned carrier: an imported mesh is reused only when the SC chose the
 * sender's workspace THEMSELVES. `buildProjectConfig` passes the file's workspace
 * id as `importedWorkspaceId` and its mesh endpoint as `importedMeshEndpoint`, and
 * `executorMeshPhase.ts` reuses the mesh only when `importedWorkspaceId` equals the
 * chosen `adobe.workspace` (otherwise it deploys: pinned in
 * `executorMeshPhase-executePhase.test.ts`, "deploys instead when the imported
 * workspace is NOT the selected one" and "… no Adobe workspace is selected"). So
 * both are allowed landings here, and the suite asserts the import leaves
 * `adobe.workspace` unset, which is what keeps that comparison false until the SC
 * chooses. The agent half: `tests/features/ai/server/createProjectFromFile-sendersOwn.test.ts`.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { readProjectFile } from '@/core/state/projectFileReader';
import { importedFromBundle } from '@/features/eds/services/storefront/zipStorefrontImport';
import { buildProjectConfig } from '@/features/project-creation/ui/wizard/wizardHelpers';
import {
    CONFIG_KEY_OWNERSHIP,
    PROJECT_SEED_OWNERSHIP,
    type Ownership,
} from '@/types/projectFileOwnership';
import type { WizardState } from '@/types/webview';
import type { ImportedSettings, ProjectSeed } from '@/types/wizard';
import {
    MESH_COMPONENT,
    classifiedFields,
    plantedFields,
    sendersOwnLeaks,
    sendersOwnSeed,
    sentinelFor,
    valueAt,
} from '../../../../helpers/sendersOwnFixtures';
import { stateFor } from './hooks/useWizardState.testUtils';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');

/** Where the new project's own resources are named: a sender's field landing here is the breach. */
const STATE_WRITE_TARGETS =
    /^(projectName|projectTitle|adobeOrg|adobeProject|adobeWorkspace|edsConfig)(\.|$)/;
const CONFIG_WRITE_TARGETS =
    /^(projectName|projectTitle|adobe|edsConfig\.(repoName|githubOwner|daLiveOrg|daLiveSite|existingRepo|repoUrl))(\.|$)/;

const MESH_ENDPOINT_FIELD = `configs.${MESH_COMPONENT}.MESH_ENDPOINT`;

/** The sanctioned landings (the header says why): comparison keys for the same-workspace mesh reuse. */
const CONFIG_ALLOWED: Record<string, RegExp[]> = {
    'adobe.workspaceId': [/^importedWorkspaceId$/],
    // Generated files take the NEW mesh's endpoint, never this one
    // (`envVarResolution.ts` resolveEnvVarValue, `componentConfigFiles.ts`).
    [MESH_ENDPOINT_FIELD]: [/^componentConfigs\.[^.]+\.MESH_ENDPOINT$/, /^importedMeshEndpoint$/],
};
const STATE_ALLOWED: Record<string, RegExp[]> = {
    [MESH_ENDPOINT_FIELD]: [/^componentConfigs\.[^.]+\.MESH_ENDPOINT$/],
};

/** What Import from File hands the wizard: the file through the one reader, plus the bundle's import. */
function importedSeed(): ImportedSettings {
    const seed = sendersOwnSeed();
    const read = readProjectFile(JSON.stringify(seed));
    if (!read.ok) throw new Error(`fixture refused by the reader: ${read.error}`);
    return { ...read.file, importedFrom: importedFromBundle(read.file, '/receiver/sent-demo.zip') };
}

function openAndBuild(imported: ImportedSettings): { state: WizardState; config: unknown } {
    const state = stateFor({ importedSettings: imported, existingProjectNames: [] });
    return { state, config: buildProjectConfig(state, imported, undefined, () => undefined) };
}

describe('the classification is complete and the fixture plants every sendersOwn field', () => {
    it('gives every field a reason', () => {
        const unexplained = classifiedFields().filter((f) => f.verdict.why.trim() === '');
        expect(classifiedFields().length).toBeGreaterThan(50);
        expect(unexplained).toStrictEqual([]);
    });

    it('plants a sentinel at every sendersOwn field and config key', () => {
        const seed = sendersOwnSeed();
        const unplanted = plantedFields()
            .map((f) => f.path)
            .filter((path) => valueAt(seed, path) !== sentinelFor(path));
        expect(plantedFields().length).toBeGreaterThan(20);
        expect(unplanted).toStrictEqual([]);
    });

    it('classifies every env var the component catalog declares, and nothing else', () => {
        const catalog: unknown = JSON.parse(
            readFileSync(join(REPO_ROOT, 'src/features/components/config/components.json'), 'utf8')
        );
        const declared = new Set<string>();
        const walk = (node: unknown): void => {
            if (Array.isArray(node)) return node.forEach(walk);
            if (node === null || typeof node !== 'object') return;
            for (const [key, child] of Object.entries(node)) {
                if (/^(required|optional|provides)EnvVars$/.test(key) && Array.isArray(child)) {
                    child
                        .filter((v): v is string => typeof v === 'string')
                        .forEach((v) => declared.add(v));
                }
                // The catalog's top-level `envVars` map defines each var by name.
                if (key === 'envVars' && child !== null && typeof child === 'object' && !Array.isArray(child)) {
                    Object.keys(child).forEach((v) => declared.add(v));
                }
                walk(child);
            }
        };
        walk(catalog);
        // CONTROL: the walk found the catalog's keys, so an empty diff below is not vacuous.
        expect(declared.has('ACCS_GRAPHQL_ENDPOINT')).toBe(true);
        expect([...declared].sort()).toStrictEqual(Object.keys(CONFIG_KEY_OWNERSHIP).sort());
    });

    it('rejects, at compile time, a file field nobody classified', () => {
        type PlantedFile = ProjectSeed & { senderNewResource?: string };
        // @ts-expect-error — the planted field has no verdict, so the table no longer satisfies the type
        const planted: Ownership<PlantedFile> = PROJECT_SEED_OWNERSHIP;
        expect(planted).toBe(PROJECT_SEED_OWNERSHIP);
    });
});

describe('Import from File: no sendersOwn field reaches the wizard or the creation wire', () => {
    const { state, config } = openAndBuild(importedSeed());

    it('CONTROL: the planted sentinels did reach the wizard where they are allowed', () => {
        // Without this an empty leak list could mean the seed never arrived at all.
        // The bundle import derives its provenance from the file's storefront.
        expect(state.wizardMode).toBe('import');
        expect(JSON.stringify(state)).toContain(sentinelFor('source.storefront.githubRepo'));
        expect(JSON.stringify(state)).toContain(sentinelFor('demo.source.repo'));
        expect(JSON.stringify(config)).toContain(sentinelFor('adobe.workspaceId'));
    });

    it('holds for the seed as handed, unread: every planted field, Edit-only storefront included', () => {
        const raw = sendersOwnSeed();
        const opened = openAndBuild(raw);
        expect(JSON.stringify(opened.state)).toContain(sentinelFor('importedFrom.sourceRepository'));
        expect(
            sendersOwnLeaks(opened.state, { allowed: STATE_ALLOWED, writeTargets: STATE_WRITE_TARGETS })
        ).toStrictEqual([]);
        expect(
            sendersOwnLeaks(opened.config, { allowed: CONFIG_ALLOWED, writeTargets: CONFIG_WRITE_TARGETS })
        ).toStrictEqual([]);
    });

    it('seeds no sender resource into the wizard state', () => {
        expect(
            sendersOwnLeaks(state, { allowed: STATE_ALLOWED, writeTargets: STATE_WRITE_TARGETS })
        ).toStrictEqual([]);
    });

    it('hands creation no sender resource', () => {
        expect(
            sendersOwnLeaks(config, { allowed: CONFIG_ALLOWED, writeTargets: CONFIG_WRITE_TARGETS })
        ).toStrictEqual([]);
    });

    it('leaves the Adobe workspace unset, so an imported mesh is reused only once the SC chooses', () => {
        expect(valueAt(config, 'adobe.workspace')).toBeUndefined();
        expect(valueAt(config, 'importedWorkspaceId')).toBe(sentinelFor('adobe.workspaceId'));
    });

    it('lets the SC choose the sender’s workspace themselves: that, and only that, matches the import', () => {
        const chosen: WizardState = {
            ...state,
            adobeWorkspace: { id: sentinelFor('adobe.workspaceId'), name: 'Chosen By The SC' },
        };
        const wire = buildProjectConfig(chosen, importedSeed(), undefined, () => undefined);
        expect(wire.adobe?.workspace).toBe(wire.importedWorkspaceId);
    });
});

describe('the enforcer catches a seeded sender resource (planted violations)', () => {
    const imported = importedSeed();
    const { state } = openAndBuild(imported);

    it('names the F280 seed if it comes back: the file’s Adobe project and workspace in the wizard', () => {
        // What `initializeAdobeContextFromImport` did before eb8b989c9.
        const reseeded: WizardState = {
            ...state,
            adobeOrg: {
                id: String(imported.adobe?.orgId),
                code: '',
                name: String(imported.adobe?.orgName),
            },
            adobeProject: {
                id: String(imported.adobe?.projectId),
                name: String(imported.adobe?.projectName),
            },
            adobeWorkspace: {
                id: String(imported.adobe?.workspaceId),
                name: String(imported.adobe?.workspaceName),
            },
        };
        const leaked = sendersOwnLeaks(reseeded, {
            allowed: STATE_ALLOWED,
            writeTargets: STATE_WRITE_TARGETS,
        });
        expect(leaked.map((l) => l.field)).toEqual(
            expect.arrayContaining(['adobe.orgId', 'adobe.projectId', 'adobe.workspaceId'])
        );
        const wire = buildProjectConfig(reseeded, imported, undefined, () => undefined);
        expect(
            sendersOwnLeaks(wire, {
                allowed: CONFIG_ALLOWED,
                writeTargets: CONFIG_WRITE_TARGETS,
            }).map((l) => l.at)
        ).toEqual(expect.arrayContaining(['adobe.workspace', 'adobe.projectId']));
    });

    it('names a provenance field made a write target: the sender’s repository as the new one', () => {
        const repo = String(imported.source?.storefront?.githubRepo);
        const pushedToSender: WizardState = {
            ...state,
            edsConfig: {
                accsHost: '',
                storeViewCode: '',
                customerGroup: '',
                repoName: repo,
                daLiveOrg: '',
                daLiveSite: '',
            },
        };
        expect(
            sendersOwnLeaks(pushedToSender, {
                allowed: STATE_ALLOWED,
                writeTargets: STATE_WRITE_TARGETS,
            })
        ).toStrictEqual([{ field: 'source.storefront.githubRepo', at: 'edsConfig.repoName' }]);
    });
});
