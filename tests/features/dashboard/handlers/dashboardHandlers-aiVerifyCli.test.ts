/**
 * The ON-OPEN AI verify carries whether Claude Code is installed (AI-4a).
 *
 * Two paths feed the "AI Ready" badge: this on-open check, and the
 * `verify-ai-setup` request the badge re-runs after Regenerate. Both must carry
 * the answer or the badge is right on one and green on the other. The request
 * path is pinned in aiHandlers-setup.test.ts; this pins the on-open one, by
 * capturing the verify the status handler wires into the check and running it.
 */

jest.mock('@/features/dashboard/handlers/warmOrgServicesCatalog', () => ({
    warmOrgServicesCatalog: jest.fn().mockResolvedValue(undefined),
}));
const mockVerifyAiSetup = jest.fn();
jest.mock('@/features/ai/aiSetupVerifier', () => ({
    verifyAiSetup: (...a: unknown[]) => mockVerifyAiSetup(...a),
}));
let mockCapturedVerify: ((p: string, h?: Record<string, string>) => Promise<unknown>) | undefined;
jest.mock('@/features/dashboard/services/onOpenChecks/aiVerifyCheck', () => ({
    createAiVerifyCheck: (deps: { verify: typeof mockCapturedVerify }) => {
        mockCapturedVerify = deps.verify;
        return { id: 'ai-verify', mode: 'background', run: async () => ({ status: 'ok' }) };
    },
}));
jest.mock('@/features/dashboard/services/onOpenChecks/orchestrator', () => ({
    runOnOpenChecks: jest.fn(async () => undefined),
}));

// The shared wall (its jest.mock of the service locator, vscode and the staleness
// detector) loads BEFORE the subject, so the subject binds to it.
import { setupMocks } from './dashboardHandlers.testUtils';
import './dashboardValidatorMocks';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { resetAgentCliCache } from '@/features/ai/engine/agentCli';
import { handleRequestStatus } from '@/features/dashboard/handlers/statusHandlers';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

beforeEach(() => {
    mockCapturedVerify = undefined;
    resetAgentCliCache();
    mockVerifyAiSetup.mockResolvedValue({ status: 'ok', checks: [], inventory: { skills: [], mcps: [], sessionMcps: [] } });
});

it("adds the command executor's answer about the SC's agent to the on-open verify", async () => {
    const { mockContext } = setupMocks();
    const commandExists = jest.fn().mockResolvedValue(true);
    jest.mocked(ServiceLocator.getCommandExecutor).mockReturnValue(
        createMockCommandExecutor({ commandExists }),
    );

    await handleRequestStatus(mockContext);
    const result = await mockCapturedVerify!('/proj');

    expect(commandExists).toHaveBeenCalledWith('copilot');
    expect(result).toMatchObject({ agentCli: { installed: true, name: 'Copilot CLI' } });
});
