/*
 * The one statement of what to do about a Configuration Service refusal.
 *
 * These assertions are deliberately about MEANING rather than wording: the four
 * surfaces that show this were each wrong in the same way on 2026-09-23, and what
 * made them wrong was not phrasing but a missing step. A rewrite that drops the
 * uninstall, the primary-email precondition, or the warning that a repository
 * re-add does nothing must fail here.
 */

import {
    GITHUB_APP_SETTINGS_URL,
    NO_ADMIN_ROLE_REMEDY_SHORT,
    describeNoAdminRoleRemedy,
} from '@/features/eds/services/configService/noAdminRoleRemedy';

describe('describeNoAdminRoleRemedy', () => {
    it('leads with the primary email, because reinstalling with the wrong one grants the wrong address', () => {
        const remedy = describeNoAdminRoleRemedy('kmanns');
        expect(remedy).toContain('github.com/settings/emails');
        expect(remedy.indexOf('PRIMARY')).toBeLessThan(remedy.indexOf('uninstall'));
    });

    it('says to uninstall the app completely, not to re-save a repository', () => {
        const remedy = describeNoAdminRoleRemedy('kmanns');
        expect(remedy).toContain('uninstall AEM Code Sync completely');
        // Measured: a repository re-add mints only a 30-minute key. A version of this
        // that omits the warning sends people down the path that cost an afternoon.
        expect(remedy).toContain('single repository is NOT enough');
    });

    it('tells them to re-grant every repository, naming the org when it is known', () => {
        expect(describeNoAdminRoleRemedy('kmanns')).toContain('every kmanns repository');
        expect(describeNoAdminRoleRemedy()).toContain('every repository');
    });

    it('points at the settings page, since the app\'s own page cannot uninstall', () => {
        expect(GITHUB_APP_SETTINGS_URL).toBe('https://github.com/settings/installations');
    });
});

describe('NO_ADMIN_ROLE_REMEDY_SHORT', () => {
    it('fits the config probe\'s paste budget', () => {
        // The probe caps its whole verdict at 400 characters; this is most of one.
        expect(NO_ADMIN_ROLE_REMEDY_SHORT.length).toBeLessThan(250);
    });

    it('keeps all three essentials the long form has', () => {
        // Two statements of the same fix is the drift this module exists to prevent,
        // so they are held to the same content rather than trusted to stay in step.
        expect(NO_ADMIN_ROLE_REMEDY_SHORT).toContain('PRIMARY');
        expect(NO_ADMIN_ROLE_REMEDY_SHORT).toContain('uninstall AEM Code Sync completely');
        expect(NO_ADMIN_ROLE_REMEDY_SHORT).toMatch(/single repository does not grant/);
    });
});
