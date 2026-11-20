/**
 * Report to Demo Builder's draft carries nothing from the demo (owner, 2026-11-19). Every text value
 * in a project's manifest is hidden unless it is Demo Builder's own public word (read from the files
 * it ships) or a version or a date: no list of what to hide, so a field added later is covered.
 */

import { ISSUES_NEW_URL, issueBody, issueUrl, knownNamesOf, publicWords, redactForIssue } from '@/features/ai/server/demoBuilderIssue';
import { createMockProject } from '../../../helpers/projectFake';

const PROJECT = createMockProject({
    name: 'acme-widgets',
    path: '/Users/someone/.demo-builder/projects/acme-widgets',
    componentInstances: {
        'eds-storefront': {
            id: 'eds-storefront',
            name: 'EDS Storefront',
            status: 'deployed',
            metadata: { githubRepo: 'jdoe/acme-storefront', lastSyncedCommit: '1.2.3', someLaterField: 'Globex Corp' },
        },
    },
    componentConfigs: { 'adobe-commerce-accs': { ACCS_STORE_CODE: 'acme_store', SOME_NEW_SETTING: 'initech-west' } },
});

let PUBLIC: ReadonlySet<string> = new Set();
beforeAll(async () => {
    PUBLIC = await publicWords();
});

describe('what a draft hides', () => {
    const known = () => knownNamesOf([PROJECT], PUBLIC);

    it('hides every value from the manifest, a field no one listed included', () => {
        for (const value of ['acme-widgets', 'jdoe', 'acme-storefront', 'acme_store', 'Globex Corp', 'initech-west']) {
            expect(known()).toContain(value);
        }
    });

    it("keeps Demo Builder's own words, read from the files it ships, and versions", () => {
        for (const value of ['deployed', 'eds-storefront', 'EDS Storefront', '1.2.3']) expect(known()).not.toContain(value);
    });

    it('hides whole words only', () => {
        expect(redactForIssue('maintain the jdoe main branch', ['jdoe', 'main'])).toBe('maintain the <name> <name> branch');
    });

    it('takes out addresses, emails and tokens whatever they contain', () => {
        const text = redactForIssue('GET https://acme.example.com/x failed for a@b.co with ghp_' + 'a'.repeat(32), []);
        expect(text).not.toMatch(/acme\.example|a@b\.co|ghp_/u);
    });
});

describe('the draft', () => {
    it("opens GitHub's new-issue page with nothing from the demo in it", () => {
        const url = issueUrl(
            { title: 'Update fails for acme-widgets', whatFailed: 'Applying the update to acme-widgets', diagnosis: 'The jdoe/acme-storefront merge' },
            '1.0.0-beta.153',
            knownNamesOf([PROJECT], PUBLIC),
        );
        expect(url.startsWith(`${ISSUES_NEW_URL}?title=`)).toBe(true);
        expect(decodeURIComponent(url)).not.toMatch(/acme|jdoe/u);
        expect(decodeURIComponent(url)).toContain('Demo Builder version: 1.0.0-beta.153');
    });

    it('is cut short to fit a link', () => {
        const body = issueBody({ title: 't', whatFailed: 'it failed. '.repeat(900), diagnosis: 'y' }, '1', []);
        expect(body.length).toBeLessThan(5100);
        expect(body.endsWith('(cut short)')).toBe(true);
    });
});
