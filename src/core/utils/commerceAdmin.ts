/**
 * Open a project's Commerce Admin in the browser: the dashboard's Admin button
 * (`handleOpenAdminPanel`) and a datapack install's "Open Admin" (datapack-engine step 12)
 * open it the same way.
 *
 * The URL comes from `getAdminPanelUrl` (an explicit `ADOBE_COMMERCE_ADMIN_URL` wins, else an
 * ACCS project's tenant endpoint, in the interface `resolveAdminExperience` says) and is validated
 * before it is opened (it is user-supplied; http is allowed beside https, the localhost and
 * private-IP blocks still apply).
 *
 * The Unified Shell opens in the SC's own browser, signed in (owner, 2026-11-03: it loaded there, and
 * its link and header name the org and instance). Any other Admin opens in a private window: Commerce
 * Admin rejects a request whose adobe.com cookies have grown too large, and Adobe's only answers are
 * clearing them or a window without them. An SC who hits that in the Unified Shell chooses Classic UI.
 *
 * @module core/utils/commerceAdmin
 */

import * as vscode from 'vscode';
import { openInDefaultBrowser, openInIncognito, openPrivateBrowser } from './browserUtils';
import { validateURL } from '@/core/validation/URLValidator';
import type { CommerceAdminExperience, Project } from '@/types/base';
import { getAdminPanelUrl } from '@/types/typeGuards';

const UNIFIED_SHELL_ORIGIN = 'https://experience.adobe.com/';

/** What a project opens until someone chooses otherwise (owner, 2026-11-02). */
const DEFAULT_ADMIN_EXPERIENCE: CommerceAdminExperience = 'unified-shell';

/** The project's own choice, else the setting's; anything unrecognized is the default. */
export function resolveAdminExperience(project: Project | undefined | null): CommerceAdminExperience {
    const value = project?.commerceAdminExperience
        ?? vscode.workspace.getConfiguration('demoBuilder.commerce').get<string>('adminExperience');
    return value === 'classic' ? 'classic' : DEFAULT_ADMIN_EXPERIENCE;
}

/**
 * The project's Admin URL, in its chosen interface. The Unified Shell's address needs the
 * organization's short name (`demoBuilder.daLive.IMSOrgId`), so with none set it is the classic one.
 */
export function resolveAdminPanelUrl(project: Project | undefined | null): string | undefined {
    const org = vscode.workspace.getConfiguration('demoBuilder.daLive').get<string>('IMSOrgId')?.trim();
    return getAdminPanelUrl(project, resolveAdminExperience(project) === 'unified-shell' ? org : undefined);
}

/**
 * Open an Admin URL that has been validated, in the browser its interface wants.
 *
 * @param options.notify - show the "Opening a private browser" notification while Chrome starts,
 *   for an open with no button to show its own spinner (a link, a menu item, a closed dialog)
 */
export async function openAdminUrl(url: string, options: { notify?: boolean } = {}): Promise<void> {
    if (url.startsWith(UNIFIED_SHELL_ORIGIN)) {
        await openInDefaultBrowser(url);
        return;
    }
    await (options.notify ? openPrivateBrowser(url) : openInIncognito(url));
}

/** What opening the Admin came to. */
export type AdminOpening = { outcome: 'opened' } | { outcome: 'no-url' } | { outcome: 'invalid'; error: unknown };

/**
 * Open the project's Commerce Admin, or say why not. Never logs the URL: it may embed credentials.
 *
 * @param project - the project whose Admin to open
 * @param options.notify - show the "Opening a private browser" notification while Chrome starts,
 *   for an open with no button to show its own spinner (a link, a menu item, a closed dialog)
 */
export async function openCommerceAdmin(project: Project | undefined | null, options: { notify?: boolean } = {}): Promise<AdminOpening> {
    const url = resolveAdminPanelUrl(project);
    if (!url) return { outcome: 'no-url' };
    try {
        validateURL(url, ['https', 'http']);
    } catch (error) {
        return { outcome: 'invalid', error };
    }
    await openAdminUrl(url, options);
    return { outcome: 'opened' };
}
