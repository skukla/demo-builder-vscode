/**
 * "Save as demo package": what the extension already knows about a project,
 * written as the description file a colleague's "Add a demo" reads, and the
 * checks that say whether their add will work.
 *
 * The file is built from the project (never typed again): the brand or demo
 * the project was built on gives the name, description, flags and mesh
 * posture; the Commerce config gives the store codes; the project's own
 * selections give the block libraries, the datapack and the integrations; the
 * storefront's content site gives `contentSource`, with the index path the
 * site actually answers under (convention 113: whoever names a content site
 * names its index path).
 *
 * @module features/eds/services/demoPackage/demoPackageService
 */

import { resolveContentIndex } from '../contentIndex';
import type { GitHubRepoOperations } from '../github/githubRepoOperations';
import {
    ACCS_STORE_CODE,
    ACCS_STORE_VIEW_CODE,
    ACCS_WEBSITE_CODE,
    PAAS_STORE_CODE,
    PAAS_STORE_VIEW_CODE,
    PAAS_WEBSITE_CODE,
} from '@/core/config/envVarKeys';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { getAppBuilderComponentEntry } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { lookupComponentConfigValue } from '@/features/components/services/envVarHelpers';
import { resolveStorefrontForProject } from '@/features/components/services/storefrontResolver';
import type { Project } from '@/types/base';
import type { DaLiveContentSource, DemoIntegrations, DemoPackage } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';
import { SHARED_DEMO_FILE_VERSION, type SharedDemoDescription } from '@/types/projectFile';
import { getEdsDaLiveTarget, getEdsRepoParts } from '@/types/typeGuards';

/** The storefront the project owns, as the file and the checks need it. */
export interface OwnStorefront {
    owner: string;
    repo: string;
    daLiveOrg: string;
    daLiveSite: string;
}

/** Read the project's own storefront from its EDS instance metadata; undefined for a non-EDS project. */
export function ownStorefrontOf(project: Project): OwnStorefront | undefined {
    // The same accessors every other EDS door uses: a real project's instance
    // metadata carries `githubRepo` and `daLiveOrg` and normally NO `daLiveSite`
    // (the site name is the repository name; the loader strips the legacy copy).
    // Found live on 2026-09-13: a first draft read `daLiveSite` directly and refused
    // the owner's own Bodea project as "not an Edge Delivery project".
    const repo = getEdsRepoParts(project);
    const site = getEdsDaLiveTarget(project);
    if (!repo || !site) return undefined;
    return { owner: repo.owner, repo: repo.repo, daLiveOrg: site.org, daLiveSite: site.site };
}

/** Store codes under both key families, as the Add dialog writes them, from whichever the project set. */
function storeCodeDefaults(project: Project): Record<string, string> | undefined {
    const configs = project.componentConfigs ?? {};
    const pairs: Array<[string, string]> = [
        [PAAS_WEBSITE_CODE, ACCS_WEBSITE_CODE],
        [PAAS_STORE_CODE, ACCS_STORE_CODE],
        [PAAS_STORE_VIEW_CODE, ACCS_STORE_VIEW_CODE],
    ];
    const out: Record<string, string> = {};
    for (const [paas, accs] of pairs) {
        const value = lookupComponentConfigValue(configs, paas) ?? lookupComponentConfigValue(configs, accs);
        if (value) {
            out[paas] = value;
            out[accs] = value;
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

/** The integrations the project carries: catalog ids by id, custom apps by repository (the export's own split). */
function integrationsOf(project: Project): DemoIntegrations | undefined {
    const catalog: string[] = [];
    const custom: NonNullable<DemoIntegrations['custom']> = {};
    for (const [id, state] of Object.entries(project.appBuilderComponents ?? {})) {
        if (state.kind !== 'integration') continue;
        if (getAppBuilderComponentEntry(id)) {
            catalog.push(id);
        } else if (state.source) {
            custom[id] = { ...state.source, ...(state.name ? { name: state.name } : {}) };
        }
    }
    if (catalog.length === 0 && Object.keys(custom).length === 0) return undefined;
    return {
        ...(catalog.length ? { catalog } : {}),
        ...(Object.keys(custom).length ? { custom } : {}),
    };
}

/** What the SC may edit before the file is written: prefilled from the brand or demo, else the project. */
export interface PackageDraft {
    name: string;
    description: string;
}

export function packageDraftFor(project: Project, packages?: readonly DemoPackage[]): PackageDraft {
    const resolved = resolveStorefrontForProject(project, packages);
    // A Starter build has no brand to speak for it: the project's own title does.
    const isStarter = resolved?.package.id === 'starter';
    const name = !isStarter && resolved ? resolved.package.name : getProjectDisplayName(project);
    const description = !isStarter && resolved ? resolved.package.description : '';
    return { name, description };
}

/**
 * The description file's content for this project.
 *
 * @param project - The project being shared
 * @param draft - The name and description as the SC left them
 * @param contentSource - The project's own content site, its index path resolved
 * @param packages - The catalog; defaults to the bundled one
 */
export function describeProject(
    project: Project,
    draft: PackageDraft,
    contentSource: DaLiveContentSource,
    packages?: readonly DemoPackage[],
): SharedDemoDescription {
    const resolved = resolveStorefrontForProject(project, packages);
    const pkg = resolved?.package;
    const requiresMesh = resolved?.storefront?.requiresMesh ?? pkg?.requiresMesh;
    const configDefaults = storeCodeDefaults(project);
    const integrations = integrationsOf(project);
    const blockLibraries = project.selectedBlockLibraries?.filter((id) => id.length > 0);
    return {
        kind: 'demo',
        version: SHARED_DEMO_FILE_VERSION,
        name: draft.name.trim() || getProjectDisplayName(project),
        ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
        ...(configDefaults ? { configDefaults } : {}),
        ...(pkg?.configFlags && Object.keys(pkg.configFlags).length ? { configFlags: pkg.configFlags } : {}),
        ...(requiresMesh !== undefined ? { requiresMesh } : {}),
        ...(project.datapack ? { datapack: { name: project.datapack.name, version: project.datapack.version } } : {}),
        ...(integrations ? { integrations } : {}),
        ...(blockLibraries?.length ? { blockLibraries } : {}),
        contentSource,
    };
}

/** One thing a colleague's add will need, checked, in a sentence the SC reads. */
export interface PackageCheck {
    id: 'repository' | 'branch' | 'index' | 'datapack' | 'custom-app';
    ok: boolean;
    message: string;
    /** The door that fixes it, when one exists on the dashboard. */
    action?: 'republish';
    /** For a custom-app check: the repository the sentence is about. */
    repository?: string;
}

export interface PackageCheckDeps {
    repoOps: Pick<GitHubRepoOperations, 'getRepository'>;
    fetchImpl?: typeof fetch;
    /** Is this datapack in the datapack service? Undefined when the service cannot be asked. */
    datapackExists?: (name: string) => Promise<boolean | undefined>;
    logger: Logger;
}

/** The content site with the index path it answers under; the fallback path when none does. */
export async function resolveOwnContentSource(
    storefront: OwnStorefront,
    deps: Pick<PackageCheckDeps, 'fetchImpl' | 'logger'>,
): Promise<{ contentSource: DaLiveContentSource; indexFound: boolean; pageCount?: number }> {
    const index = await resolveContentIndex(
        { org: storefront.daLiveOrg, site: storefront.daLiveSite },
        deps.fetchImpl ?? fetch,
        deps.logger,
    );
    return {
        contentSource: { org: storefront.daLiveOrg, site: storefront.daLiveSite, indexPath: index.indexPath },
        indexFound: index.found,
        ...(index.pageCount !== undefined ? { pageCount: index.pageCount } : {}),
    };
}

/**
 * Everything a colleague's "Add a demo" will need, checked now and said plainly.
 */
export async function packageChecks(
    project: Project,
    storefront: OwnStorefront,
    index: { indexFound: boolean; pageCount?: number },
    deps: PackageCheckDeps,
): Promise<PackageCheck[]> {
    const checks: PackageCheck[] = [];
    const repository = await readRepository(deps.repoOps, storefront.owner, storefront.repo, deps.logger);
    if (!repository) {
        checks.push({ id: 'repository', ok: false, message: "The repository can't be read with your GitHub sign-in." });
    } else {
        checks.push(
            repository.isPrivate
                ? {
                      id: 'repository',
                      ok: false,
                      message: `${repository.fullName} is private. Colleagues need access to it, or make it public.`,
                  }
                : { id: 'repository', ok: true, message: `${repository.fullName} is public.` },
        );
        checks.push({
            id: 'branch',
            ok: true,
            message: `Built from ${repository.defaultBranch}, the default branch.`,
        });
    }
    checks.push(
        index.indexFound
            ? { id: 'index', ok: true, message: `${index.pageCount ?? 0} pages are published and indexed.` }
            : {
                  id: 'index',
                  ok: false,
                  message: 'No published page list, so new projects would start empty.',
                  action: 'republish',
              },
    );
    if (project.datapack && deps.datapackExists) {
        const exists = await deps.datapackExists(project.datapack.name);
        if (exists === false) {
            checks.push({
                id: 'datapack',
                ok: false,
                message: `The datapack "${project.datapack.name}" isn't in the datapack service yet.`,
            });
        } else if (exists === true) {
            checks.push({ id: 'datapack', ok: true, message: `The datapack "${project.datapack.name}" is in the datapack service.` });
        }
    }
    for (const [id, state] of Object.entries(project.appBuilderComponents ?? {})) {
        if (state.kind !== 'integration' || getAppBuilderComponentEntry(id) || !state.source) continue;
        const fullName = `${state.source.owner}/${state.source.repo}`;
        const custom = await readRepository(deps.repoOps, state.source.owner, state.source.repo, deps.logger);
        checks.push(
            custom && !custom.isPrivate
                ? { id: 'custom-app', ok: true, message: `${fullName} is public.`, repository: fullName }
                : {
                      id: 'custom-app',
                      ok: false,
                      message: `${fullName} is private or can't be read. Colleagues need access to it for this integration.`,
                      repository: fullName,
                  },
        );
    }
    return checks;
}

async function readRepository(
    repoOps: Pick<GitHubRepoOperations, 'getRepository'>,
    owner: string,
    repo: string,
    logger: Logger,
) {
    try {
        return await repoOps.getRepository(owner, repo);
    } catch (error) {
        logger.debug(`[Demo package] ${owner}/${repo}: ${(error as Error).message}`);
        return undefined;
    }
}
