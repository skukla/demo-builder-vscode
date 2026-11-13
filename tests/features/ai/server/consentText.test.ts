/**
 * What a consent dialog shows of a call's arguments: the authored keys, in order, as a person
 * reads them. A list target is shown, not left as a blank line.
 */

import { buildConsentPrompt, renderTargetForConsent } from '@/features/ai/server/consentText';
import { rememberShownClear } from '@/features/data-installer/services/demoDataWipe/shownClears';

describe('renderTargetForConsent', () => {
    it('shows a list of flat objects as their values, joined', () => {
        const args = { stores: [{ websiteCode: 'justrite_test_website', storeCode: 'justrite_test_store' }, { websiteCode: 'bodea' }], token: 'abc' };

        expect(renderTargetForConsent(args, ['stores'])).toBe('Stores: justrite_test_website/justrite_test_store, bodea');
    });

    it('shows scalars as before, masks secret-shaped keys and skips what it cannot show', () => {
        const args = { path: '/products/x', publish: true, token: 'abc', nested: { a: 1 } };

        expect(renderTargetForConsent(args, ['path', 'publish', 'token', 'nested'])).toBe('Path: /products/x\nPublish: true\nToken: ***');
    });
});

/**
 * reset_project acts on the open project and takes no argument naming it, but it can now remove a
 * datapack's data from Commerce (step-05 S7). The dialog names the project AND shows the choice.
 */
describe('buildConsentPrompt for a reset that can uninstall the datapack', () => {
    const OPEN = 'Project: acme';

    it('names the open project and says the datapack is uninstalled, with the answer about the changes', () => {
        const prompt = buildConsentPrompt('reset_project', { confirm: true, removeData: true, changes: 'drop' }, OPEN);

        expect(prompt?.detail).toContain('Commerce');
        expect(prompt?.detail.endsWith(`${OPEN}\nUninstall Datapack: true\nYour changes: drop`)).toBe(true);
    });

    it('CONTROL: a plain reset names only the open project', () => {
        const prompt = buildConsentPrompt('reset_project', { confirm: true }, OPEN);

        expect(prompt?.detail.endsWith(`\n\n${OPEN}`)).toBe(true);
        expect(prompt?.detail).not.toContain('Uninstall Datapack:');
    });
});

/**
 * clear_demo_data is handed only a token, so the dialog names what that token's list covers: the
 * websites, and the warning when another project uses one (S3, owner review 2026-11-13).
 */
describe('buildConsentPrompt for clear_demo_data', () => {
    const OPEN = 'Project: zz-tester';

    it("names the open project, the list's websites and the warning, from the plan the token names", () => {
        const warning = 'The project Neighbour also uses the website justrite_test_website. Clearing it also removes what was added there by hand for that project.';
        rememberShownClear('tok-consent-1', { websites: ['justrite_test_website', 'bodea'], warning });

        const prompt = buildConsentPrompt('clear_demo_data', { token: 'tok-consent-1', confirm: true }, OPEN);

        expect(prompt?.detail.split('\n\n').slice(1)).toEqual([`${OPEN}\nWebsites: justrite_test_website, bodea\n${warning}`]);
    });

    it('names the websites alone when no other project uses them', () => {
        rememberShownClear('tok-consent-2', { websites: ['bodea'] });

        expect(buildConsentPrompt('clear_demo_data', { token: 'tok-consent-2', confirm: true }, OPEN)?.detail).toMatch(/\nWebsites: bodea$/);
    });

    it('names the project alone for a token no check answered: the handler refuses that call', () => {
        expect(buildConsentPrompt('clear_demo_data', { token: 'never-shown', confirm: true }, OPEN)?.detail).toMatch(/\n\nProject: zz-tester$/);
    });
});
