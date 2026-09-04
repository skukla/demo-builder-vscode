/**
 * resetRepoToTemplate — placeholder-stub wiring.
 *
 * The stub CONTENT is pinned in placeholderStubs.test.ts; this suite pins the
 * WIRING: the reset's bulk file-override map must carry one stub per sheet the
 * boilerplate requests, in the same atomic commit as fstab/config (a separate
 * commit could race the template reset and be lost). Asserting the ARGUMENT
 * handed to githubFileOps.resetRepoToTemplate — not a mock's echo — per the
 * repo's mock-audit rule.
 */

import { buildParams, installDefaults, runReset } from './edsResetRepoHelper.testUtils';
import {
    PLACEHOLDER_STUB_PATHS,
    buildPlaceholderStubJson,
} from '@/features/eds/services/placeholderStubs';

beforeEach(installDefaults);

describe('resetRepoToTemplate — placeholder stubs ride the bulk override commit', () => {
    it('hands one stub per requested sheet to githubFileOps.resetRepoToTemplate', async () => {
        const { overrides } = await runReset(buildParams());

        expect(overrides?.get('fstab.yaml')).toBe('mock-fstab');
        for (const sheetPath of PLACEHOLDER_STUB_PATHS) {
            expect(overrides?.get(`${sheetPath}.json`)).toBe(buildPlaceholderStubJson());
        }
    });
});
