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

    it("names the datapack the clearing uninstalls first, and the call's answer about its changes (C3)", () => {
        rememberShownClear('tok-consent-3', { websites: ['bodea'], datapack: 'Bodea B2B' });

        const prompt = buildConsentPrompt('clear_demo_data', { token: 'tok-consent-3', confirm: true, changes: 'keep', saveAs: { displayName: 'My Bodea' } }, OPEN);

        expect(prompt?.detail).toContain("Uninstalls this project's datapack first");
        expect(prompt?.detail.endsWith(`${OPEN}\nWebsites: bodea\nUninstalls first: Bodea B2B\nYour changes: keep`)).toBe(true);
    });

    it('names the project alone for a token no check answered: the handler refuses that call', () => {
        expect(buildConsentPrompt('clear_demo_data', { token: 'never-shown', confirm: true }, OPEN)?.detail).toMatch(/\n\nProject: zz-tester$/);
    });
});

/**
 * clear_commerce_instance is handed only a token and the answers by project path, so the dialog names
 * what that instance check showed: the websites, each project whose datapack is uninstalled first,
 * each project that keeps its datapack and data, and the answers by project name (step 06 C6).
 */
describe('buildConsentPrompt for clear_commerce_instance', () => {
    const OPEN = 'Project: zz-tester';
    const PROJECTS = [
        { path: '/p/zz', name: 'Zz Tester', datapack: 'zz-test' },
        { path: '/p/nb', name: 'Neighbour Demo', datapack: 'nb-pack' },
        { path: '/p/far', name: 'Far Away', kept: true as const },
        { path: '/p/plain', name: 'Plain Demo' },
    ];

    it('says it cannot be undone except the datapacks, and names the websites and every project by its fate', () => {
        rememberShownClear('instance-consent-1', { websites: ['justrite_test_website', 'bodea'], projects: PROJECTS });

        const prompt = buildConsentPrompt('clear_commerce_instance', { token: 'instance-consent-1', confirm: true, understood: true }, OPEN);

        expect(prompt?.title).toContain("Clear this Commerce instance's websites");
        expect(prompt?.detail).toContain("This can't be undone, except the datapacks");
        expect(prompt?.detail.split('\n\n').slice(1)).toEqual([
            [
                OPEN,
                'Websites: justrite_test_website, bodea',
                'Uninstalls first: zz-test (Zz Tester), nb-pack (Neighbour Demo)',
                'Keep their datapacks and data: Far Away',
                'Also lose their demo data: Plain Demo',
            ].join('\n'),
        ]);
    });

    it("shows the call's answers about each project's changes, by project name", () => {
        rememberShownClear('instance-consent-2', { websites: ['bodea'], projects: PROJECTS });

        const prompt = buildConsentPrompt(
            'clear_commerce_instance',
            {
                token: 'instance-consent-2',
                confirm: true,
                understood: true,
                changes: { '/p/zz': 'drop', '/p/nb': 'keep' },
                saveAs: { '/p/nb': 'My Neighbour' },
            },
            OPEN,
        );

        expect(prompt?.detail.endsWith('\nYour changes: Zz Tester: drop; Neighbour Demo: keep as My Neighbour')).toBe(true);
    });

    it('names the project alone for a token no check answered: the handler refuses that call', () => {
        expect(buildConsentPrompt('clear_commerce_instance', { token: 'never-shown', confirm: true, understood: true }, OPEN)?.detail).toMatch(/\n\nProject: zz-tester$/);
    });
});
