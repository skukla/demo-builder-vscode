/**
 * Deployable Secret Key Scheme (D2 Track B — Step 04)
 *
 * The ONE place that defines how a deployable's `type:'secret'` env vars are
 * keyed in VS Code SecretStorage (repo is PUBLIC — secrets never go to
 * componentConfigs / .env / settings / fixtures). Per-project, per-deployable,
 * per-var so two projects (or two deployables) never collide.
 *
 * @module features/app-builder/services/secretKey
 */

/** Namespace prefix for all deployable secrets in SecretStorage. */
const SECRET_KEY_PREFIX = 'demoBuilder.deployableSecret';

/**
 * Build the deterministic SecretStorage key for a deployable's secret var.
 *
 * @param projectId - Stable project identifier (e.g. project name/path key)
 * @param deployableId - The deployable's catalog id (e.g. "erp-integration")
 * @param varName - The secret env-var name (e.g. "ERP_API_KEY")
 * @returns A stable key, e.g. "demoBuilder.deployableSecret.{project}.{dep}.{var}"
 */
export function secretKey(projectId: string, deployableId: string, varName: string): string {
    return `${SECRET_KEY_PREFIX}.${projectId}.${deployableId}.${varName}`;
}
