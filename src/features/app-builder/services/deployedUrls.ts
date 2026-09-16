/**
 * Which URLs a deployed App Builder app answers on.
 *
 * Split out of `appDeployment.ts` so the deploy file stays within the 400-line services
 * limit, and because "where do the URLs come from" is its own question — see
 * `appDeployment-urlSources.test.ts`.
 */

import type { DeclaredAction } from './appConfigPackages';
import type { AppDeploymentResult } from './types';

/**
 * The URL of every action the app declares, in the namespace it was deployed to.
 *
 * Built from the app's own config rather than asked of the CLI, because the CLI has
 * no answer for an EXTENSION-layout app: `aio app get-url` exits 2 on that layout,
 * and `aio app deploy` prints only the static SPA URL (both measured on the Bodea
 * redeploy, 2026-09-16 — the App Management install was skipped for want of its
 * `/app-management/` URL). The URL shape is Runtime's own and was checked against
 * the same deployment: two derived web URLs answered 401, which is an action that
 * exists and wants auth; a path the app does not declare answered 404.
 *
 * Keys follow `get-url` — `runtime/<package>/<action>` — so a record written by either
 * source reads the same. Every consumer searches the VALUES.
 */
export function urlsForDeclaredActions(
    namespace: string,
    actions: DeclaredAction[],
): Record<string, string> {
    const base = `https://${namespace}.adobeioruntime.net/api/v1`;
    const urls: Record<string, string> = {};
    for (const { packageName, actionName, web } of actions) {
        const route = `${packageName}/${actionName}`;
        urls[`runtime/${route}`] = web ? `${base}/web/${route}` : `${base}/${route}`;
    }
    return urls;
}

/** The payload shape both URL sources answer with: a primary URL plus the map. */
export function urlPayload(deployedUrls: Record<string, string>): AppDeploymentResult['data'] {
    const webKey = Object.keys(deployedUrls).find((k) => k.startsWith('web/'));
    const url = webKey ? deployedUrls[webKey] : (Object.values(deployedUrls)[0] ?? '');
    return { url, deployedUrls };
}
