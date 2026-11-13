/**
 * What a consent dialog shows of a call's arguments: the authored keys, in order, as a person
 * reads them. A list target (`clear_demo_data`'s stores) is shown, not left as a blank line.
 */

import { buildConsentPrompt, renderTargetForConsent } from '@/features/ai/server/consentText';

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
