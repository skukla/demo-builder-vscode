/**
 * The third-party tooling setting's "Apply Now" reaches the home Chat too (PL-60,
 * 2026-10-31): after every project, the `refreshHome` callback `extension.ts` composes
 * (`ensureHomeMcpTools`) runs, so turning the opt-out off takes Playwright and its skills out
 * of the home, and turning it on installs them there.
 */

jest.mock('@/core/state/projectDirectoryScanner', () => ({
    ProjectDirectoryScanner: jest.fn().mockImplementation(() => ({ getAllProjects: async () => [] })),
}));
jest.mock('@/features/project-creation/services/aiBundle/mcpConfigWriter', () => ({
    resolveNodePath: async () => '/usr/local/bin/node',
}));

import * as vscode from 'vscode';
import { registerThirdPartyToolingSettingListener } from '@/features/project-creation/services/aiBundle/thirdPartyToolingSettingListener';
import { createMockCommandExecutor } from '../../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../../helpers/loggerFake';

const onChange = vscode.workspace.onDidChangeConfiguration as jest.Mock;
const showInfo = vscode.window.showInformationMessage as jest.Mock;

/** Register, then fire a change to the setting with the SC's answer. */
async function changeSetting(answer: string | undefined, refreshHome: () => Promise<void>): Promise<void> {
    registerThirdPartyToolingSettingListener(createMockCommandExecutor(), '/ext', createMockLogger(), refreshHome);
    const listener = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    showInfo.mockResolvedValueOnce(answer);
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({ get: () => false });
    await listener({ affectsConfiguration: (key: string) => key === 'demoBuilder.ai.enableThirdPartyTools' });
}

beforeEach(() => jest.clearAllMocks());

it('applies the answer to the home Chat after the projects', async () => {
    const refreshHome = jest.fn(async () => undefined);

    await changeSetting('Apply Now', refreshHome);

    expect(refreshHome).toHaveBeenCalledTimes(1);
});

it('leaves the home alone when the SC declines', async () => {
    const refreshHome = jest.fn(async () => undefined);

    await changeSetting(undefined, refreshHome);

    expect(refreshHome).not.toHaveBeenCalled();
});
