/**
 * keepOwnCopy — the one fork the extension makes for a colleague's demo,
 * shared by the add and the change-source commits.
 */

import { COPY_FAILED, isAddedDemo, keepOwnCopy } from '@/features/eds/services/sharedDemoCopy';
import { makeAddedDemo } from '../../../helpers/demoPackageFixtures';
import { createMockLogger } from '../../../helpers/loggerFake';

const JEN = makeAddedDemo();
const validateToken = jest.fn();
const createFork = jest.fn();
const setTemplateFlag = jest.fn();
const services = { tokenService: { validateToken }, repoOperations: { createFork, setTemplateFlag } };

beforeEach(() => {
    jest.clearAllMocks();
    validateToken.mockResolvedValue({ valid: true, user: { login: 'steve' } });
    setTemplateFlag.mockResolvedValue(undefined);
});

describe('keepOwnCopy', () => {
    it('forks into the signed-in account, flags the fork as a template, and answers the row that reads from it', async () => {
        createFork.mockResolvedValue({ fullName: 'steve/isle5-demo', defaultBranch: 'main' });

        const outcome = await keepOwnCopy(JEN, services, createMockLogger());

        expect(createFork).toHaveBeenCalledWith('jen', 'isle5-demo');
        expect(setTemplateFlag).toHaveBeenCalledWith('steve', 'isle5-demo');
        expect(outcome).toEqual({
            row: { ...JEN, source: { owner: 'steve', repo: 'isle5-demo', branch: 'main' } },
            forkedTo: 'steve/isle5-demo',
        });
    });

    it("answers the SC's own repository unchanged, whatever the case of the login", async () => {
        validateToken.mockResolvedValue({ valid: true, user: { login: 'JEN' } });

        expect(await keepOwnCopy(JEN, services, createMockLogger())).toEqual({ row: JEN });
        expect(createFork).not.toHaveBeenCalled();
    });

    it('shrugs when the template flag is refused, and reports a fork GitHub refused', async () => {
        createFork.mockResolvedValueOnce({ fullName: 'steve/isle5-demo', defaultBranch: 'main' });
        setTemplateFlag.mockRejectedValueOnce(new Error('nope'));
        expect('row' in (await keepOwnCopy(JEN, services, createMockLogger()))).toBe(true);

        createFork.mockRejectedValueOnce(new Error('403'));
        expect(await keepOwnCopy(JEN, services, createMockLogger())).toEqual({ error: COPY_FAILED });
    });
});

describe('isAddedDemo', () => {
    it('accepts a row with a kind, a name, a source and a storefront kind, and nothing less', () => {
        expect(isAddedDemo(JEN)).toBe(true);
        expect(isAddedDemo({ ...JEN, storefrontKind: 'weird' })).toBe(false);
        expect(isAddedDemo({ ...JEN, source: { owner: 'jen' } })).toBe(false);
        expect(isAddedDemo(null)).toBe(false);
    });
});
