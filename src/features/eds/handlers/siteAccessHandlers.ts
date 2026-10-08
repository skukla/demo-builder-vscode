/**
 * Site access handlers — the Site access webview's half of the extension.
 *
 * Pattern B: each handler RETURNS what the screen shows next. Reading,
 * changing and VERIFYING live in the two headless managers, which the agent's
 * site tools call too, so the webview and the agent share one spine; this file
 * only resolves the target, calls them, and words the outcome via
 * `siteAccessReport`.
 *
 * Which site: the open project's storefront when it has one. Otherwise the
 * content half still works from an org and site the SC typed — the person
 * sharing a storefront need not have built it with Demo Builder.
 *
 * @module features/eds/handlers/siteAccessHandlers
 */

import * as vscode from 'vscode';
import { openUrl } from '@/core/utils/browserUtils';
import { maskEmail } from '@/core/utils/maskEmail';
import { stageLine } from '@/core/utils/stageLine';
import { getDaLiveAuthService } from '@/features/eds/handlers/edsServiceCache';
import { waitForConfigAccess } from '@/features/eds/services/configService/configAccessRecovery';
import { GITHUB_APP_SETTINGS_URL } from '@/features/eds/services/configService/noAdminRoleRemedy';
import {
    addSiteAdmin,
    listSiteAccess,
    looksLikeEmail,
    removeSiteAdmin,
} from '@/features/eds/services/configService/siteAccessManagerHeadless';
import {
    addContentReader,
    listContentReaders,
    removeContentReader,
    type DaSiteTarget,
} from '@/features/eds/services/daLive/contentAccessManagerHeadless';
import { createDaLiveServiceTokenProvider } from '@/features/eds/services/daLive/daLiveTokenProviders';
import { GITHUB_APP_INSTALL_URL } from '@/features/eds/services/github/githubAppService';
import {
    ACCESS_CONFIRMED,
    SESSION_REFUSED,
    adminChangeNotice,
    adminListOf,
    readerChangeNotice,
    readerListOf,
    stillRefused,
} from '@/features/eds/services/siteAccess/siteAccessReport';
import type { Project } from '@/types/base';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';
import { SITE_ACCESS_PROGRESS_MESSAGE } from '@/types/messages';
import { getEdsDaLiveTarget, getEdsRepoParts } from '@/types/typeGuards';
import type {
    SiteAccessChangeResult,
    SiteAccessLink,
    SiteAccessList,
    SiteAccessNotice,
    SiteAccessView,
} from '@/types/webviewPayloads';

/**
 * Where each link goes. The webview names an id and never a URL, so it cannot
 * be made to open anything else.
 */
const LINK_URLS: Record<SiteAccessLink['id'], string> = {
    'github-app-settings': GITHUB_APP_SETTINGS_URL,
    'code-sync-app': GITHUB_APP_INSTALL_URL,
    'github-email-settings': 'https://github.com/settings/emails',
};

interface TargetPayload {
    /** The typed org and site — used only when no project storefront is open. */
    target?: Partial<DaSiteTarget>;
}

interface EmailPayload extends TargetPayload {
    email?: string;
}

function ok(data: SiteAccessView | SiteAccessChangeResult): HandlerResponse {
    return { success: true, data };
}

function refuse(error: string): HandlerResponse {
    return { success: false, error };
}

/** The open project, when it has a storefront whose access can be managed. */
async function storefrontProject(context: HandlerContext): Promise<Project | undefined> {
    const project = await context.stateManager.getCurrentProject();
    return getEdsRepoParts(project) ? project : undefined;
}

/** The project's DA.live site, or the one the SC typed. */
function readerTarget(project: Project | undefined, payload?: TargetPayload): DaSiteTarget | undefined {
    if (project) return getEdsDaLiveTarget(project);
    const org = payload?.target?.org?.trim();
    const site = payload?.target?.site?.trim();
    return org && site ? { org, site } : undefined;
}

/** Both lists as they are now — admins only exist for a project storefront. */
async function readView(
    context: HandlerContext,
    project: Project | undefined,
    payload?: TargetPayload,
): Promise<SiteAccessView> {
    const view: SiteAccessView = {};
    if (project) {
        const owner = getEdsRepoParts(project)?.owner ?? '';
        view.admins = adminListOf(await listSiteAccess(project, context.context, context.logger), owner);
    }
    view.readers = await readReaders(context, project, payload);
    return view;
}

async function readReaders(
    context: HandlerContext,
    project: Project | undefined,
    payload?: TargetPayload,
): Promise<SiteAccessList | undefined> {
    const target = readerTarget(project, payload);
    if (!target) return undefined;
    return readerListOf(await listContentReaders(target, context.context, context.logger));
}

function cleanEmail(payload?: EmailPayload): string | undefined {
    const email = payload?.email?.trim() ?? '';
    return looksLikeEmail(email) ? email : undefined;
}

/** Run one change, then answer with what happened and the lists re-read. */
async function change(
    context: HandlerContext,
    payload: EmailPayload | undefined,
    run: (email: string, project: Project | undefined) => Promise<SiteAccessNotice | string>,
): Promise<HandlerResponse> {
    const email = cleanEmail(payload);
    if (!email) return refuse('That is not an email address.');
    const project = await storefrontProject(context);
    const outcome = await run(email, project);
    if (typeof outcome === 'string') return refuse(outcome);
    return ok({ notice: outcome, view: await readView(context, project, payload) });
}

/** Masked to the log, full to the person. */
function logChange(context: HandlerContext, notice: SiteAccessNotice, loggable: string): void {
    if (notice.tone === 'success') context.logger.info(`[Site Access] ${loggable}`);
}

const NO_STOREFRONT = 'This project has no Edge Delivery storefront to manage.';
const NO_TARGET = 'Name the DA.live organization and site first.';

export const siteAccessHandlers = defineHandlers({
    getSiteAccess: async (context: HandlerContext, payload?: TargetPayload): Promise<HandlerResponse> =>
        ok(await readView(context, await storefrontProject(context), payload)),

    addSiteAdmin: async (context: HandlerContext, payload?: EmailPayload): Promise<HandlerResponse> =>
        change(context, payload, async (email, project) => {
            if (!project) return NO_STOREFRONT;
            const result = await addSiteAdmin(project, email, context.context, context.logger);
            const notice = adminChangeNotice(result, `${email} can now administer this site.`);
            logChange(context, notice, `${maskEmail(email)} can now administer this site.`);
            return notice;
        }),

    removeSiteAdmin: async (context: HandlerContext, payload?: EmailPayload): Promise<HandlerResponse> =>
        change(context, payload, async (email, project) => {
            if (!project) return NO_STOREFRONT;
            const result = await removeSiteAdmin(project, email, context.context, context.logger);
            const notice = adminChangeNotice(result, `${email} is no longer a configuration admin.`);
            logChange(context, notice, `${maskEmail(email)} is no longer a configuration admin.`);
            return notice;
        }),

    addContentReader: async (context: HandlerContext, payload?: EmailPayload): Promise<HandlerResponse> =>
        change(context, payload, async (email, project) => {
            const target = readerTarget(project, payload);
            if (!target) return NO_TARGET;
            const result = await addContentReader(target, email, context.context, context.logger);
            const landed = `can now read ${target.site}'s content on DA.live.`;
            const notice = readerChangeNotice(result, `${email} ${landed}`);
            logChange(context, notice, `${maskEmail(email)} ${landed}`);
            return notice;
        }),

    removeContentReader: async (context: HandlerContext, payload?: EmailPayload): Promise<HandlerResponse> =>
        change(context, payload, async (email, project) => {
            const target = readerTarget(project, payload);
            if (!target) return NO_TARGET;
            const result = await removeContentReader(target, email, context.context, context.logger);
            const landed = `no longer reads ${target.site}'s content.`;
            const notice = readerChangeNotice(result, `${email} ${landed}`);
            logChange(context, notice, `${maskEmail(email)} ${landed}`);
            return notice;
        }),

    /** Poll until the admin role lands — up to about two minutes — and say which way it went. */
    waitForSiteAccess: async (context: HandlerContext): Promise<HandlerResponse> => {
        const project = await storefrontProject(context);
        const site = getEdsRepoParts(project);
        if (!project || !site) return refuse(NO_STOREFRONT);
        const outcome = await waitForConfigAccess(
            createDaLiveServiceTokenProvider(getDaLiveAuthService(context.context)),
            site,
            context.logger,
            (attempt, total) =>
                context.sendMessage(SITE_ACCESS_PROGRESS_MESSAGE, {
                    message: stageLine('Checking access', { index: attempt, total }),
                }),
        );
        if (outcome === 'granted') return ok({ notice: ACCESS_CONFIRMED, view: await readView(context, project) });
        if (outcome === 'unauthenticated') return ok({ notice: SESSION_REFUSED, view: await readView(context, project) });
        // Read once and use it twice: the list shown and the reason it is still refused.
        const listing = await listSiteAccess(project, context.context, context.logger);
        return ok({
            notice: stillRefused(listing, site.owner),
            view: { admins: adminListOf(listing, site.owner), readers: await readReaders(context, project) },
        });
    },

    openSiteAccessLink: async (
        _context: HandlerContext,
        payload?: { id?: SiteAccessLink['id'] },
    ): Promise<HandlerResponse> => {
        const id = payload?.id;
        if (!id || !Object.prototype.hasOwnProperty.call(LINK_URLS, id)) return refuse('Unknown link.');
        await openUrl(LINK_URLS[id]);
        return { success: true };
    },

    repairSiteConfiguration: async (_context: HandlerContext): Promise<HandlerResponse> => {
        await vscode.commands.executeCommand('demoBuilder.repairSiteConfiguration');
        return { success: true };
    },
});
