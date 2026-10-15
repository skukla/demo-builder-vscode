/**
 * One Commerce instance runs one ERP integration (owner, 2026-10-15, AB-78).
 *
 * The integration installs into the whole instance: its order hooks and checkout checks
 * apply to every website in it. A second one, from another project, claims the same
 * orders and gates the same checkout, and on this release Commerce sees both as the same
 * app, so removing either strips both (`.rptc/research/second-erp-shared-commerce/`).
 * More ERPs join the existing integration ("Add another ERP") in the project that owns it.
 *
 * Pure: the handler that calls this loads the other projects (ADR-015).
 *
 * @module features/app-builder/services/erpIntegrationOnSameCommerce
 */

import { deriveCommerceTarget } from './appManagementInstaller';
import { isDeployed } from './pairWithSameErpElsewhere';
import { getProjectDisplayName, type ProjectNameParts } from '@/core/utils/projectDisplayName';
import { bringsSystem } from '@/features/components/services/appBuilderComponentLinks';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { CommerceSource, Project } from '@/types/base';

type Catalog = readonly AppBuilderComponentCatalogEntry[];

/** The Commerce instance a project points at, as compared, or undefined when it has none. */
function instanceOf(project: CommerceSource): string | undefined {
    const target = deriveCommerceTarget(project);
    return 'error' in target ? undefined : target.commerceBaseUrl.toLowerCase();
}

/** Whether a project runs an ERP integration (the first, or a numbered copy). */
function runsErpIntegration(project: Project, catalog: Catalog): boolean {
    return Object.entries(project.appBuilderComponents ?? {}).some(
        ([id, state]) => isDeployed(state) && bringsSystem({ kind: state.kind, id, catalogId: state.catalogId }, catalog),
    );
}

/**
 * Another local project that already runs an ERP integration on the Commerce instance
 * this add would install one into.
 *
 * @param project - the project about to add `entry`
 * @param entry - the catalog entry being added
 * @param catalog - the catalog, to tell the ERP integration by its bound ERP
 * @param others - every other local project, loaded
 * @returns the project that holds the instance's ERP integration, else undefined
 */
export function erpIntegrationOnSameCommerce(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    catalog: Catalog,
    others: Project[],
): Project | undefined {
    if (!bringsSystem(entry, catalog)) return undefined;
    return erpIntegrationHolder(project, catalog, others.filter((other) => other.path !== project.path));
}

/**
 * The local project that runs an ERP integration on the Commerce instance `source`
 * names. The wizard asks this before a project exists, so it takes the choices alone.
 *
 * @param source - the backend and its values, from a project or the wizard
 * @param catalog - the catalog, to tell the ERP integration by its bound ERP
 * @param projects - the local projects to look in
 * @returns the project that holds the instance's ERP integration, else undefined
 */
export function erpIntegrationHolder(
    source: CommerceSource,
    catalog: Catalog,
    projects: Project[],
): Project | undefined {
    const instance = instanceOf(source);
    if (!instance) return undefined;
    return projects.find(
        (other) => instanceOf(other) === instance && runsErpIntegration(other, catalog),
    );
}

/**
 * Why the add was refused, naming the project to add the ERP to.
 *
 * @param holder - the project that runs the instance's ERP integration
 * @returns the message
 */
export function oneErpIntegrationPerInstance(holder: ProjectNameParts): string {
    const name = getProjectDisplayName(holder);
    return `${name} already has an ERP integration on this Commerce instance. Add your ERP there instead.`;
}
