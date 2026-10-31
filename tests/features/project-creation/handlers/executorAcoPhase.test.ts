/**
 * Creation's ACO step (PL-60 P2): a project created with the ACO add-on gets its credential in its
 * Adobe workspace, behind the guard chain; without ACO the step does nothing; a refusal stops
 * creation with the reason.
 */

import { executeAcoCredentialPhase } from '@/features/project-creation/handlers/executorAcoPhase';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

const mockSetUp = jest.fn();
const mockGuards = jest.fn();
const mockDeps = jest.fn();
jest.mock('@/features/app-builder/services/acoCredential', () => ({ setUpAcoCredential: (...a: unknown[]) => mockSetUp(...a) }));
jest.mock('@/features/dashboard/handlers/appBuilderComponentGuards', () => ({ runGuards: (...a: unknown[]) => mockGuards(...a) }));
jest.mock('@/features/dashboard/handlers/acoCredentialHandlers', () => ({ credentialDeps: (...a: unknown[]) => mockDeps(...a) }));

const context: HandlerContext = createMockHandlerContext();
const DEPS = { projectPath: '/p' };

beforeEach(() => {
    jest.clearAllMocks();
    mockGuards.mockResolvedValue(undefined);
    mockDeps.mockReturnValue(DEPS);
    mockSetUp.mockResolvedValue({ success: true, apiCode: 'AcoIngestionCode' });
});

describe('executeAcoCredentialPhase', () => {
    it('does nothing for a project without ACO', async () => {
        const progress = jest.fn();
        await executeAcoCredentialPhase(context, createMockProject({ selectedAddons: [] }), progress);
        expect(mockSetUp).not.toHaveBeenCalled();
        expect(progress).not.toHaveBeenCalled();
    });

    it('sets up the credential for a project with ACO, saying so on the progress bar', async () => {
        const progress = jest.fn();
        const project = createMockProject({ selectedAddons: ['adobe-commerce-aco'] });
        await executeAcoCredentialPhase(context, project, progress);
        expect(mockGuards).toHaveBeenCalledWith(context, project);
        expect(mockSetUp).toHaveBeenCalledWith(DEPS);
        expect(progress).toHaveBeenCalledWith(expect.any(String), expect.any(Number), 'Setting up the Adobe Commerce Optimizer credential');
    });

    it('stops creation with the guard\'s reason, making nothing', async () => {
        mockGuards.mockResolvedValue({ error: 'Sign in to Adobe to continue.' });
        await expect(executeAcoCredentialPhase(context, createMockProject({ selectedAddons: ['adobe-commerce-aco'] }), jest.fn())).rejects.toThrow(
            'Sign in to Adobe to continue.',
        );
        expect(mockSetUp).not.toHaveBeenCalled();
    });

    it('stops creation when the credential cannot be made', async () => {
        mockSetUp.mockResolvedValue({ success: false, error: 'This Adobe org offers no "Adobe Commerce Optimizer Ingestion API"' });
        await expect(executeAcoCredentialPhase(context, createMockProject({ selectedAddons: ['adobe-commerce-aco'] }), jest.fn())).rejects.toThrow(/offers no/u);
    });
});
