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
