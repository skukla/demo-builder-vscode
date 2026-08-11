/**
 * AppBuilderComponent Secret Key Scheme (D2 Track B — Step 04)
 *
 * The ONE place that defines how an App Builder component's `type:'secret'` env vars are
 * keyed in VS Code SecretStorage (repo is PUBLIC — secrets never go to
 * componentConfigs / .env / settings / fixtures). Per-project, per-appBuilderComponent,
 * per-var so two projects (or two appBuilderComponents) never collide.
 *
 * @module features/app-builder/services/secretKey
 */

/** Namespace prefix for all appBuilderComponent secrets in SecretStorage. */
const SECRET_KEY_PREFIX = 'demoBuilder.appBuilderComponentSecret';

/**
 * Build the deterministic SecretStorage key for an App Builder component's secret var.
 *
 * @param projectId - Stable project identifier (e.g. project name/path key)
 * @param appBuilderComponentId - The appBuilderComponent's catalog id (e.g. "erp-integration")
 * @param varName - The secret env-var name (e.g. "ERP_API_KEY")
 * @returns A stable key, e.g. "demoBuilder.appBuilderComponentSecret.{project}.{dep}.{var}"
 */
export function secretKey(projectId: string, appBuilderComponentId: string, varName: string): string {
    return `${SECRET_KEY_PREFIX}.${projectId}.${appBuilderComponentId}.${varName}`;
}
