/**
 * storefrontJobs: one name per storefront job, and the two ways a progress line
 * carries what the job is doing (`.rptc/plans/progress-vocabulary/overview.md`).
 */

import { STOREFRONT_JOBS, countLine, itemCount, jobLine } from '@/core/utils/storefrontJobs';

describe('jobLine', () => {
    it('puts the detail after the job name', () => {
        expect(jobLine(STOREFRONT_JOBS.copyingContent, '40 of 103 files')).toBe(
            'Copying the content: 40 of 103 files',
        );
    });

    // Line 2 shows only the detail once the job's name is stripped off it
    // (stepUnder), so the detail has to read as a phrase on its own (owner,
    // 2026-10-16: "what is 'finding them'? That's not good grammar").
    it('starts a phrase with a capital, so no lowercase fragment reaches a screen', () => {
        expect(jobLine(STOREFRONT_JOBS.warmingProductPages, 'reading the catalog')).toBe(
            'Warming product pages: Reading the catalog',
        );
    });

    it('leaves a detail that already starts with a capital or a number as it is', () => {
        expect(jobLine(STOREFRONT_JOBS.copyingContent, 'Finding the pages to copy')).toBe(
            'Copying the content: Finding the pages to copy',
        );
        expect(jobLine(STOREFRONT_JOBS.publishingPages, '64 pages published')).toBe(
            'Publishing the pages: 64 pages published',
        );
    });

    // A repository, a site or an org is a NAME: "Skukla/demo" would be a different
    // spelling of it. Names carry no spaces; phrases do.
    it.each([
        ['an owner/repository', 'skukla/citisignal-demo'],
        ['a bare repository name', 'citisignal'],
        ['a DA.live org and site', 'acme/storefront'],
    ])('leaves %s exactly as it is spelled', (_label, name) => {
        expect(jobLine(STOREFRONT_JOBS.resettingRepository, name)).toBe(`Resetting the repository: ${name}`);
    });
});

describe('countLine', () => {
    it('counts the items done out of the total, in the plural', () => {
        expect(countLine(32, 64, 'page')).toBe('32 of 64 pages');
    });

    it('uses the singular unit when the total is one', () => {
        expect(countLine(1, 1, 'page')).toBe('1 of 1 page');
    });
});

describe('itemCount', () => {
    it('names how many there are, singular for one', () => {
        expect(itemCount(2, 'sheet')).toBe('2 sheets');
        expect(itemCount(1, 'sheet')).toBe('1 sheet');
    });
});

describe('STOREFRONT_JOBS', () => {
    // One name per job: two jobs sharing a name would read as the same work.
    it('gives every job a different name', () => {
        const names = Object.values(STOREFRONT_JOBS);
        expect(new Set(names).size).toBe(names.length);
    });
});
