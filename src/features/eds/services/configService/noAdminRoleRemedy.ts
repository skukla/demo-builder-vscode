/**
 * What to do when the Configuration Service refuses you.
 *
 * Stated ONCE, because four surfaces tell a user about this refusal — the BYOM
 * overlay failure, the config probe, Manage Site Access, and its poll — and on
 * 2026-09-23 all four were wrong at the same time, each having kept its own copy
 * of the answer. They now compose this.
 *
 * ## What was measured, 2026-09-23, on a colleague's own namespace
 *
 * A site whose owner holds no admin role refuses EVERY door: the org config read,
 * an org config write, the site config read, and the site's access record — for an
 * Adobe identity and a Google one alike, in a clean session with the identity
 * confirmed. AEM's own User Admin tool refuses him too, because it carries the
 * same identity. So there is no way in over the API, and for most of a day that
 * looked like the end of it.
 *
 * Then the GitHub App was uninstalled COMPLETELY and installed again, and the org
 * config gained the missing roster entry within the minute:
 *
 *     "users": [{ "email": "<his adobe address>", "roles": ["admin"] }]
 *
 * The distinction that matters, and the reason the afternoon was lost to it:
 *
 * | | mints a 30-minute admin key | writes the users roster |
 * |---|---|---|
 * | Re-saving a repository on an existing installation | yes | NO |
 * | Uninstalling the app and installing it again | yes | YES |
 *
 * Both report "AEM Code Sync registration updated", so the failing one looks
 * exactly like the working one. His org config had accumulated eight of those
 * short-lived keys over three months while the roster stayed empty.
 *
 * The role is minted for the GitHub account's PRIMARY email as it stands at
 * install time, which is why the primary-email check comes first: reinstalling
 * with the wrong address primary simply grants the role to the wrong address.
 *
 * @module features/eds/services/configService/noAdminRoleRemedy
 */

/** Where a GitHub App installation is removed — the step the app's own page cannot offer. */
export const GITHUB_APP_SETTINGS_URL = 'https://github.com/settings/installations';

/**
 * The same fix in one sentence, for a surface with a length budget — the config
 * probe's verdict is capped so it can be pasted into a message.
 *
 * It lives here rather than at the call site so the two cannot drift apart, which
 * is the failure this module exists to prevent. A test holds both to the same three
 * essentials: the primary email, uninstalling COMPLETELY, and the warning that
 * re-adding a repository is not the same thing.
 */
export const NO_ADMIN_ROLE_REMEDY_SHORT =
    'Fix: make your Adobe address PRIMARY at github.com/settings/emails, then ' +
    'uninstall AEM Code Sync completely and install it again, re-granting every repository. ' +
    'Re-adding a single repository does not grant the role.';

/**
 * The fix, in the order it has to be done.
 *
 * @param org - the GitHub owner whose repositories must be re-granted, when known
 * @returns one paragraph a person can follow without reading anything else
 */
export function describeNoAdminRoleRemedy(org?: string): string {
    const repositories = org ? `every ${org} repository` : 'every repository';
    return (
        'Reinstalling the AEM Code Sync GitHub App grants it to you. First check ' +
        'github.com/settings/emails: the role goes to whichever address is your PRIMARY ' +
        'email when the app is installed, so make that the address you sign in to Adobe ' +
        'with. Then uninstall AEM Code Sync completely and install it again, re-granting ' +
        `${repositories} — the selection is rebuilt from scratch. Removing and re-adding a ` +
        'single repository is NOT enough: it mints a short-lived key and leaves the role ' +
        'untouched, while reporting the same success.'
    );
}
