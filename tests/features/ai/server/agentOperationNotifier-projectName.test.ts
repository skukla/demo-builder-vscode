/**
 * The agent's progress card names the project a call acts in, when its named form uses it.
 * Live release test, 2026-10-22: "Agent · Adding another ERP: Loading demo data" ran for
 * fifteen minutes beside an action the SC started, and nothing said which was which.
 * Split from agentOperationNotifier.test.ts (its size); the same vscode stub.
 */

const mockWithProgress = jest.fn(
    async (_opts: unknown, task: (progress: { report: (v: unknown) => void }) => Promise<unknown>) =>
        task({ report: () => undefined }),
);
const mockSetStatusBarMessage = jest.fn();
const mockGetStateManager = jest.fn();

jest.mock(
    'vscode',
    () => ({
        window: {
            withProgress: (...a: unknown[]) => mockWithProgress(...(a as [unknown, () => Promise<unknown>])),
            setStatusBarMessage: (...a: unknown[]) => mockSetStatusBarMessage(...a),
            showWarningMessage: jest.fn(),
        },
        workspace: { getConfiguration: jest.fn() },
        env: { openExternal: jest.fn() },
        Uri: { parse: (value: string) => ({ parsed: value }) },
        ProgressLocation: { Notification: 15 },
    }),
    { virtual: true },
);

jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getStateManager: (...a: unknown[]) => mockGetStateManager(...a) },
}));

import { createAgentOperationNotifier } from '@/features/ai/server/agentOperationNotifier';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { makeStateManager } from '../../../helpers/stateManagerFake';

const logger = createMockLogger() as unknown as Logger;
const titles = (): unknown[] => mockWithProgress.mock.calls.map(([opts]) => (opts as { title: string }).title);

beforeEach(() => {
    jest.clearAllMocks();
    mockGetStateManager.mockReturnValue(null);
});

it('names the ERP being added and the open project, in the card and in how it lands', async () => {
    mockGetStateManager.mockReturnValue(makeStateManager(createMockProject({ name: 'JustRite' })));
    await createAgentOperationNotifier(logger)('add_erp', async () => ({ ok: true }), { id: 'erp-integration', name: 'Accuform' });
    expect(titles()).toStrictEqual(['Agent · Adding Accuform ERP to JustRite']);
    expect(mockSetStatusBarMessage).toHaveBeenCalledWith(expect.stringContaining('Adding Accuform ERP to JustRite — done'), expect.any(Number));
});

it('names the ERP alone when no project can be read', async () => {
    mockGetStateManager.mockImplementation(() => {
        throw new Error('not ready');
    });
    await createAgentOperationNotifier(logger)('add_erp', async () => ({ ok: true }), { name: 'Accuform' });
    expect(titles()).toStrictEqual(['Agent · Adding Accuform ERP']);
});
