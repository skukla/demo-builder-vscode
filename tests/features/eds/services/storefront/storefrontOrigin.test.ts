/**
 * Reading what a storefront repository was built on (EDS-13f steps 01 and 07).
 *
 * The rule the report keeps (step 07, the verifying rules): a read that FAILED
 * says "could not read", never "not present". GitHub answers a missing file
 * with null through `getFileContent`; a throw is a failed read.
 */

import { readRepoBoilerplate } from '@/features/eds/services/storefront/storefrontOrigin';
import { createMockLogger } from '../../../../helpers/loggerFake';

const logger = createMockLogger();
const AISTORE = { owner: 'sayurihanki', repo: 'aistore' };

function fileOps(answer: () => Promise<{ content: string } | null>) {
    return {
        getFileContent: jest.fn(async (_owner: string, _repo: string, path: string, _ref?: string) => {
            const file = await answer();
            return file ? { content: file.content, sha: 's', path, encoding: 'utf-8' } : null;
        }),
    };
}

describe('readRepoBoilerplate', () => {
    it("reads the repository's package.json, on the branch asked for", async () => {
        const ops = fileOps(async () => ({
            content: JSON.stringify({ name: '@adobe/aem-boilerplate-commerce', version: '4.0.1' }),
        }));

        const result = await readRepoBoilerplate(ops, AISTORE, logger, 'demo');

        expect(ops.getFileContent).toHaveBeenCalledWith('sayurihanki', 'aistore', 'package.json', 'demo');
        expect(result).toEqual({
            status: 'read',
            value: { name: '@adobe/aem-boilerplate-commerce', version: '4.0.1' },
        });
    });

    it('is absent when the repository has no package.json, or one that names no version', async () => {
        expect(await readRepoBoilerplate(fileOps(async () => null), AISTORE, logger)).toEqual({ status: 'absent' });
        expect(
            await readRepoBoilerplate(fileOps(async () => ({ content: '{"name":"x"}' })), AISTORE, logger),
        ).toEqual({ status: 'absent' });
    });

    it('says it could not read, never that it is absent, when the read fails', async () => {
        const failing = fileOps(async () => {
            throw new Error('GitHub answered 502');
        });

        expect(await readRepoBoilerplate(failing, AISTORE, logger)).toEqual({
            status: 'unreadable',
            reason: 'GitHub answered 502',
        });
    });
});
