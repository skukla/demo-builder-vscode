/**
 * The project file's writer: a project in, the version-2 project file out.
 *
 * ONE writer (PL-56c). Every export door writes {@link createExportSettings}, and
 * every door into the wizard reads it back through ONE reader, `readProjectFile`
 * (`core/state/projectFileReader.ts`), which also migrates the version-1 files
 * written before 2026-10 (PL-56e): Import reads a file from disk, Copy reads
 * {@link copySeedFromProject}, and Edit reads {@link extractSettingsFromProject},
 * the same file with the SC's own values and storefront put back.
 */

import { stripSecretValues } from '@/core/config/envVarKeys';
import {
    readProjectFile,
    storefrontProvenance,
    type ReadProjectFileResult,
} from '@/core/state/projectFileReader';
import { getAppBuilderComponentEntry } from '@/features/components/services/appBuilderComponentCatalogLoader';
import type { Project } from '@/types/base';
import { PROJECT_FILE_SUFFIX, PROJECT_FILE_VERSION, type ProjectFile } from '@/types/projectFile';
import type { SettingsAdobeContext, SettingsEdsConfig } from '@/types/settingsFile';
import type { ProjectSeed } from '@/types/wizard';

/**
 * Derive the wizard's custom-source map from the keyed `appBuilderComponents`
 * map (§E, shell instancing Step 8). The keyed map is the durable model —
 * deriving (instead of persisting a parallel copy) means removed integrations
 * can never resurrect in edit mode. Qualifying entries are custom-URL imports
 * and AI-built instances: `kind === 'integration'` AND not a catalog id
 * (catalog + mesh entries round-trip via their selection ids, keeping their
 * edit-mode row kinds stable). The persisted display `name` rides along.
 *
 * @param project - Source project (keyed map may be absent on legacy projects)
 * @returns The derived source map, or undefined when nothing qualifies
 */
function deriveAppBuilderComponentSources(
    project: Project,
): ProjectFile['appBuilderComponentSources'] {
    const derived: NonNullable<ProjectFile['appBuilderComponentSources']> = {};
    for (const [id, state] of Object.entries(project.appBuilderComponents ?? {})) {
        if (state.kind !== 'integration') continue;
        if (getAppBuilderComponentEntry(id) !== undefined) continue;
        // A second copy of a pre-built kind (AB-23) is not an imported repo: exported
        // as one, a new project would add it bare, without its ERP. Creation cannot
        // make copies yet, so it stays out of the file.
        if (state.catalogId) continue;
        if (!state.source) continue; // defensive: malformed persisted entry
        derived[id] = state.name ? { ...state.source, name: state.name } : { ...state.source };
    }
    return Object.keys(derived).length ? derived : undefined;
}

/**
 * The project's own storefront, read from the `eds-storefront` instance.
 *
 * Edit reopens it; an export carries it only as provenance (where the project
 * lived), because the receiver creates their own.
 */
function storefrontOf(project: Project): SettingsEdsConfig | undefined {
    const metadata = project.componentInstances?.['eds-storefront']?.metadata as
        | Record<string, unknown>
        | undefined;
    if (!metadata) return undefined;
    // Parse "owner/repo" format from githubRepo metadata
    const githubRepoParts = metadata.githubRepo?.toString().split('/');
    // Only project-specific fields: templateOwner, templateRepo, contentSource and
    // patches are derived from brand + stack.
    return {
        // Derived too, and for the same reason as the site below: republish
        // and the agent's storefront tools both read `daLiveOrg || repoOwner`,
        // because the DA.live org IS the GitHub namespace. A project without a
        // stored one would reach the edit wizard's last step with an
        // incomplete config, exactly as a missing site did.
        daLiveOrg: (metadata.daLiveOrg as string | undefined) ?? githubRepoParts?.[0],
        // DERIVED, not read raw. `daLiveSite` is legacy metadata the loader
        // STRIPS on load (projectFileLoader), because the DA site name IS the
        // repo name; only unmigrated projects still carry one. Reading it raw
        // gave every migrated project an undefined site, and the edit wizard's
        // last step refused with "Storefront configuration is incomplete" after
        // the SC had walked the whole wizard with nothing wrong on screen
        // (owner, 2026-09-20). Same derivation as `getEdsDaLiveTarget`.
        daLiveSite: (metadata.daLiveSite as string | undefined) ?? githubRepoParts?.[1],
        githubOwner: githubRepoParts?.[0],
        repoName: githubRepoParts?.[1],
        repoUrl: metadata.repoUrl as string | undefined,
    };
}

/** The Adobe org, project and workspace: ids for pre-selection, names for display and matching. */
function adobeContextOf(project: Project): SettingsAdobeContext | undefined {
    const adobe = project.adobe;
    if (!adobe) return undefined;
    // project.adobe stores the org and workspace IDS in `organization`/`workspace`.
    return {
        orgId: adobe.organization,
        orgName: adobe.organizationName,
        projectId: adobe.projectId,
        projectName: adobe.projectName,
        projectTitle: adobe.projectTitle,
        workspaceId: adobe.workspace,
        workspaceName: adobe.workspaceName,
        workspaceTitle: adobe.workspaceTitle,
    };
}

/**
 * The version-2 project file for a project: everything the contract's
 * "travels" column names, values as they are (credentials included; the
 * export strips them).
 */
function projectFileOf(project: Project, extensionVersion: string): ProjectFile {
    const storefront = storefrontOf(project);
    return {
        kind: 'project',
        version: PROJECT_FILE_VERSION,
        exportedAt: new Date().toISOString(),
        source: {
            project: project.name,
            ...(project.title ? { title: project.title } : {}),
            extension: extensionVersion,
            ...(storefront ? { storefront: storefrontProvenance(storefront) } : {}),
        },
        title: project.title,
        selectedPackage: project.selectedPackage,
        selectedStack: project.selectedStack,
        selectedAddons: project.selectedAddons,
        selectedBlockLibraries: project.selectedBlockLibraries,
        customBlockLibraries: project.customBlockLibraries,
        demo: project.demo,
        selections: project.componentSelections || {},
        configs: project.componentConfigs || {},
        commerce: project.commerce,
        commerceStoreStructure: project.commerceStoreStructure,
        datapack: project.datapack,
        adobe: adobeContextOf(project),
        // Custom/instance sources are DERIVED from the keyed appBuilderComponents
        // map (§E); the attributed API picks are the manifest field as it is.
        appBuilderComponentSources: deriveAppBuilderComponentSources(project),
        componentApiPicks: project.componentApiPicks,
        aiPrompts: project.aiPrompts,
    };
}

/**
 * What Copy from Existing opens the wizard with: the file Export writes, read back
 * by the reader Import uses (PL-56e). So copying a project and importing its
 * export are the same file and the same creation wire: no credential (D24; they
 * move keychain to keychain or are entered again, never through the file), and
 * the source's storefront only as provenance, because the copy gets its own
 * repository and DA.live site.
 *
 * @param project - The project being copied
 * @returns The reader's answer: the file, or the sentence it refused with
 */
export function copySeedFromProject(project: Project): ReadProjectFileResult {
    return readProjectFile(JSON.stringify(createExportSettings(project, '')));
}

/**
 * What Edit opens the wizard with: {@link copySeedFromProject}'s file, plus the
 * two things only Edit keeps because it edits the SC's OWN project — the setting
 * values as they are (credentials included; Finish writes them back) and the
 * project's storefront, which Edit reopens already signed in.
 *
 * @param project - The project being edited
 * @returns The wizard's seed
 * @throws Error naming the project when the reader refuses its file; Edit then
 *   says so rather than opening on a seed Import would not accept
 */
export function extractSettingsFromProject(project: Project): ProjectSeed {
    const read = copySeedFromProject(project);
    if (!read.ok) throw new Error(`${project.name} can't be opened for editing: ${read.error}`);
    return { ...read.file, configs: project.componentConfigs ?? {}, edsConfig: storefrontOf(project) };
}

/**
 * Create the file an export writes: the project, and never a credential.
 *
 * The ONE function every export door goes through (the save dialog, the
 * headless `export_project_settings` tool, the demo bundle's setup part). There
 * is no include-secrets option and no stamp saying whether credentials are in
 * (owner decision D24): they are not. `SECRET_ENV_KEYS` is the register of what
 * a credential is.
 *
 * @param project - Source project
 * @param extensionVersion - Current extension version
 * @returns The version-2 project file, ready for JSON serialization
 */
export function createExportSettings(project: Project, extensionVersion: string): ProjectFile {
    const file = projectFileOf(project, extensionVersion);
    return { ...file, configs: stripSecretValues(file.configs) };
}

/**
 * Generate a suggested filename for exported settings
 *
 * @param projectName - Name of the project
 * @returns Suggested filename (e.g., "my-project.project.demo-builder.json")
 */
export function getSuggestedFilename(projectName: string): string {
    // Sanitize project name for filename
    const sanitized = projectName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    return `${sanitized || 'project'}${PROJECT_FILE_SUFFIX}`;
}
