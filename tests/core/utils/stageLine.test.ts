import { stageLine } from '@/core/utils/stageLine';

describe('stageLine', () => {
    it('adds the pair count after the stage', () => {
        expect(stageLine('Deploying the app', { index: 1, total: 2 })).toBe('Deploying the app (1 of 2)');
    });

    it('is the stage alone when the operation is not a pair', () => {
        expect(stageLine('Deploying the app')).toBe('Deploying the app');
    });
});
