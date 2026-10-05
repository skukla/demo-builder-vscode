/**
 * What the Site access screen shows, from what the two headless managers answer.
 *
 * Two systems, one screen (EDS-22). The Configuration Service roster says who may
 * ADMINISTER the site (preview, publish, its config); DA.live's permissions sheet
 * says who may READ the authored content. The managers read, change and VERIFY;
 * this module only turns their answers into lists and sentences — "the call
 * succeeded" and "the change landed" kept apart, which is what the feature was
 * built around.
 *
 * Pure, so the sentences are tested without a webview or a network. The wording
 * moved here from the QuickPick commands this screen replaced.
 *
 * @module features/eds/services/siteAccess/siteAccessReport
 */

import { describeNoAdminRoleRemedy } from '@/features/eds/services/configService/noAdminRoleRemedy';
import type {
    SiteAccessListing,
    SiteAccessMutation,
} from '@/features/eds/services/configService/siteAccessManagerHeadless';
import type {
    ContentAccessListing,
    ContentAccessMutation,
} from '@/features/eds/services/daLive/contentAccessManagerHeadless';
import type { SiteAccessList, SiteAccessNotice } from '@/types/webviewPayloads';

const SIGN_IN = 'No DA.live credential is stored. Sign in to DA.live, then try again.';
const NOT_SEEN =
    'The change was accepted but did not show up when re-read. ' +
    'Wait a moment and check the list again before relying on it.';

const APP_SETTINGS = { id: 'github-app-settings', label: 'Open GitHub App Settings' } as const;
const CODE_SYNC_APP = { id: 'code-sync-app', label: 'Open Code Sync App' } as const;
const EMAIL_SETTINGS = { id: 'github-email-settings', label: 'Open GitHub Email Settings' } as const;

function warning(message: string, extra: Partial<SiteAccessNotice> = {}): SiteAccessNotice {
    return { tone: 'warning', message, ...extra };
}

function failed(error: string | undefined): SiteAccessNotice {
    return { tone: 'error', message: `The change did not go through: ${error ?? 'unknown error'}` };
}

/**
 * Who administers the site. Org admins are shown but not removable: they hold
 * the role on every site in the org, so removing one here would revoke nothing.
 *
 * @param owner - the GitHub owner, named in the no-admin remedy
 */
export function adminListOf(listing: SiteAccessListing, owner: string): SiteAccessList {
    const siteAdmins = listing.siteAdmins ?? [];
    const isSiteAdmin = (email: string): boolean =>
        siteAdmins.some((entry) => entry.toLowerCase() === email.toLowerCase());
    return {
        site: listing.site ?? '',
        canManage: listing.status === 'ok' && listing.canManage,
        people: [
            ...siteAdmins.map((email) => ({ email, role: 'Site admin', removable: true })),
            ...(listing.orgAdmins ?? [])
                .filter((email) => !isSiteAdmin(email))
                .map((email) => ({ email, role: 'Org admin — every site', removable: false })),
        ],
        notice: adminRefusal(listing, owner),
    };
}

/** Why the admin list cannot be changed, with what is left to try; nothing when it can. */
function adminRefusal(listing: SiteAccessListing, owner: string): SiteAccessNotice | undefined {
    if (listing.status === 'ok' && listing.canManage) return undefined;
    if (listing.status === 'no_site') {
        return warning(
            'This project has no Edge Delivery storefront, so it has no site configuration to manage.',
        );
    }
    if (listing.status === 'no_credential') return warning(SIGN_IN);
    if (listing.status !== 'not_authorized' && listing.status !== 'ok') {
        return warning(
            `Could not read the site configuration for ${listing.site}. Check the Debug Logs for the response.`,
        );
    }
    return noRoleRemedy(listing, owner);
}

/**
 * The SC holds no admin role. A named org admin is the route known to work, so
 * it is the only one offered when somebody is visible; otherwise the SC fixes it
 * themselves by reinstalling the Code Sync app (`noAdminRoleRemedy.ts`).
 */
function noRoleRemedy(listing: SiteAccessListing, owner: string): SiteAccessNotice {
    const admins = listing.orgAdmins ?? [];
    const intro = `You hold no admin role on ${listing.site}.`;
    const mismatch = listing.identityMismatch;
    if (mismatch) {
        // The email change comes FIRST: the reinstall grants the role to whichever
        // address is primary at the time, so reinstalling first grants it to the
        // wrong one.
        if (admins.length > 0) {
            return warning(
                `${intro} ${mismatch.explanation} An org admin can also add you without any of that: ${admins.join(', ')}.`,
            );
        }
        return warning(`${intro} ${mismatch.explanation} ${describeNoAdminRoleRemedy(owner)}`, {
            links: [EMAIL_SETTINGS, APP_SETTINGS],
            offerWait: true,
        });
    }
    if (admins.length > 0) {
        return warning(`${intro} Ask one of these org admins to add you: ${admins.join(', ')}.`);
    }
    // Uninstalling comes first and the app's own page cannot do it, so the
    // settings page leads.
    return warning(
        `${intro} Nobody who can grant it is visible. ${describeNoAdminRoleRemedy(owner)}`,
        { links: [APP_SETTINGS, CODE_SYNC_APP], offerWait: true },
    );
}

/** After waiting: still refused, said for the case it is. */
export function stillRefused(listing: SiteAccessListing, owner: string): SiteAccessNotice {
    const mismatch = listing.identityMismatch;
    if (mismatch) {
        return warning(
            `Still refused. Make ${mismatch.adobeEmail} your primary email on GitHub, THEN ` +
                'uninstall AEM Code Sync completely and install it again, re-granting every ' +
                'repository. Doing it in the other order grants the role to ' +
                `${mismatch.githubPrimaryEmail} instead.`,
            { links: [EMAIL_SETTINGS, APP_SETTINGS], offerWait: true },
        );
    }
    return warning(
        'Still refused. Check that AEM Code Sync was UNINSTALLED and installed again — ' +
            'removing and re-adding a repository reports the same success and does not ' +
            'grant the role — and that your GitHub primary email is the address you sign ' +
            `in to Adobe with. If it was, ask whoever else administers ${owner}, or Adobe.`,
        { links: [APP_SETTINGS, CODE_SYNC_APP], offerWait: true },
    );
}

/** Access landed: the configuration write that was refused can be repaired now. */
export const ACCESS_CONFIRMED: SiteAccessNotice = {
    tone: 'success',
    message: 'Access confirmed. The site configuration still needs the write that was refused.',
    offerRepair: true,
};

/** The wait stopped on a refused session, which no admin role fixes. */
export const SESSION_REFUSED: SiteAccessNotice = warning(SIGN_IN);

/** Who reads the content. Writers are shown but not removable here. */
export function readerListOf(listing: ContentAccessListing): SiteAccessList {
    return {
        site: `${listing.org}/${listing.site}`,
        canManage: listing.status === 'ok',
        people: (listing.readers ?? []).map((reader) =>
            reader.actions === 'read'
                ? { email: reader.email, role: 'Reads', removable: true }
                : { email: reader.email, role: 'Writes', removable: false },
        ),
        notice: listing.status === 'ok' ? undefined : readerRefusal(listing),
    };
}

function readerRefusal(listing: ContentAccessListing): SiteAccessNotice {
    if (listing.status === 'no_credential') return warning(SIGN_IN);
    if (listing.status === 'not_authorized') {
        return warning(
            `DA.live refused: only the owner of the ${listing.org} organization can change who reads its content.`,
        );
    }
    if (listing.status === 'invalid') return warning(listing.error ?? 'That change is not allowed.');
    return failed(listing.error);
}

/** A content-reader change: landed, accepted but not seen, or refused. */
export function readerChangeNotice(result: ContentAccessMutation, landed: string): SiteAccessNotice {
    if (result.status !== 'ok') return readerRefusal(result);
    return result.verified ? { tone: 'success', message: landed } : warning(NOT_SEEN);
}

/** An admin change: landed, accepted but not seen, or refused. */
export function adminChangeNotice(result: SiteAccessMutation, landed: string): SiteAccessNotice {
    if (result.status === 'no_credential') return warning(SIGN_IN);
    if (result.status === 'not_authorized') {
        return warning(
            'The Configuration Service refused the change — you hold no admin role on this site.',
        );
    }
    if (result.status === 'invalid') return warning(result.error ?? 'That change is not allowed.');
    if (result.status !== 'ok') return failed(result.error);
    return result.verified ? { tone: 'success', message: landed } : warning(NOT_SEEN);
}
