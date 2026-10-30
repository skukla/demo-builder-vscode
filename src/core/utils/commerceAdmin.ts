/**
 * Open a project's Commerce Admin in the browser: the dashboard's Admin button
 * (`handleOpenAdminPanel`) and a datapack install's "Open the Admin" (datapack-engine step 12)
 * open it the same way.
 *
 * The URL comes from `getAdminPanelUrl` (an explicit `ADOBE_COMMERCE_ADMIN_URL` wins, else an
 * ACCS project's tenant endpoint), is validated before it is opened (it is user-supplied; http is
 * allowed beside https, the localhost and private-IP blocks still apply), and opens in a private
 * window: Commerce Admin rejects a request whose adobe.com cookies have grown too large.
 *
 * @module core/utils/commerceAdmin
 */

import { openInIncognito } from './browserUtils';
import { validateURL } from '@/core/validation/URLValidator';
import type { Project } from '@/types/base';
import { getAdminPanelUrl } from '@/types/typeGuards';

/** What opening the Admin came to. */
export type AdminOpening = { outcome: 'opened' } | { outcome: 'no-url' } | { outcome: 'invalid'; error: unknown };

/**
 * Open the project's Commerce Admin, or say why not. Never logs the URL: it may embed credentials.
 *
 * @param project - the project whose Admin to open
 */
export async function openCommerceAdmin(project: Project | undefined | null): Promise<AdminOpening> {
    const url = getAdminPanelUrl(project);
    if (!url) return { outcome: 'no-url' };
    try {
        validateURL(url, ['https', 'http']);
    } catch (error) {
        return { outcome: 'invalid', error };
    }
    await openInIncognito(url);
    return { outcome: 'opened' };
}
