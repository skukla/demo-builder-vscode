/**
 * deployAppComponentIsolated — the ONE isolating app-deploy seam (ADR-011 D3 Step 03).
 *
 * Package isolation is the prune boundary in the shared Adobe I/O workspace:
 * `aio app deploy` prunes only entities in the app's own package, so every
 * integration must deploy under a DISTINCT `ow.package` — never the shared
 * `application`/`dx-excshell-1`. This seam rewrites the app's `app.config.yaml`
 * to the derived package ({@link applyIsolatedPackages}) and THEN runs the
 * deploy tail. Every deploy routes through it via the keyed runner deps wiring
 * (buildDefaultRunnerDeps in project-creation/services/appBuilderComponentRunnerDeps),
 * so no un-isolated `aio app deploy` path survives. The singular headless
 * deploy was the other route until it was retired on 2026-08-04.
 *
 * @module features/app-builder/services/deployAppIsolated
 */

import { applyIsolatedPackages } from './appConfigPackages';
import { deployAppComponent, type DeployAppOptions } from './appDeployment';
import type { AppDeploymentResult } from './types';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { Logger } from '@/types/logger';

/**
 * Apply the derived distinct `ow.package` to the integration's `app.config.yaml`
 * (idempotent — a redeploy re-runs it on the previously-renamed file), then run
 * the app deploy tail. A config with no standalone packages to rename is a
 * logged no-op — which is exactly right for BOTH shapes the add door admits:
 * a standalone app always has packages to rename (guaranteed there), and an
 * extension-layout app (App Management) deliberately deploys unrewritten, since
 * its packages are fixed by the extension point and live in ext.config.yaml.
 * `aio app deploy` fails a truly broken config with its own error.
 *
 * @param componentPath - the integration's local `components/<id>/` folder
 * @param owPackage - the derived distinct package name (`deriveOwPackage(id)`)
 * @returns the deploy tail's result, unchanged
 */
export async function deployAppComponentIsolated(
    componentPath: string,
    owPackage: string,
    commandManager: CommandExecutor,
    logger: Logger,
    opts: DeployAppOptions = {},
): Promise<AppDeploymentResult> {
    const applied = await applyIsolatedPackages(componentPath, owPackage);
    logger.debug(
        applied
            ? `[App Builder] applied ow.package "${owPackage}"`
            : `[App Builder] no standalone packages to isolate for "${owPackage}"`,
    );
    return deployAppComponent(componentPath, commandManager, logger, opts);
}
