/**
 * componentReleaseReader: the lookup behind the update check and update of a mesh or App
 * Builder component. What matters is what it ASKS, so the arguments are asserted.
 */

import * as vscode from 'vscode';
import { readNewestComponentRelease } from '@/core/releases/readNewestRelease';
import { isRepoCollaborator } from '@/features/updates/services/collaboratorGate';
import { componentReleaseReader } from '@/features/updates/services/componentReleaseReader';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockSecretStorage, githubTokenSecret } from '../../../helpers/secretStorageFake';

jest.mock('@/core/releases/readNewestRelease');
jest.mock('@/features/updates/services/collaboratorGate');

const readMock = readNewestComponentRelease as jest.Mock;
const gateMock = isRepoCollaborator as jest.Mock;

function onChannel(channel: string) {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn(() => channel),
    });
}

function reader() {
    const { secrets } = createMockSecretStorage(githubTokenSecret('a-token'));
    return componentReleaseReader(secrets, createMockLogger());
}

beforeEach(() => {
    jest.clearAllMocks();
    onChannel('stable');
    readMock.mockResolvedValue({ tag_name: 'v1.2.0' });
});

it('reads the repository on the configured channel, with the token', async () => {
    await reader()('skukla/demo-erp');

    expect(readMock).toHaveBeenCalledWith(
        'skukla/demo-erp',
        'stable',
        expect.objectContaining({
            headers: expect.objectContaining({ Authorization: 'token a-token' }),
        }),
    );
});

it('answers the tag and the version, without its leading v', async () => {
    expect(await reader()('skukla/demo-erp')).toStrictEqual({ tag: 'v1.2.0', version: '1.2.0' });
});

it('answers null when there is no release', async () => {
    readMock.mockResolvedValue(null);

    expect(await reader()('skukla/demo-erp')).toBeNull();
});

it('early access reaches a collaborator', async () => {
    onChannel('early-access');
    gateMock.mockResolvedValue(true);

    await reader()('skukla/demo-erp');

    expect(readMock.mock.calls[0][1]).toBe('early-access');
});

it('early access is beta for anyone else', async () => {
    onChannel('early-access');
    gateMock.mockResolvedValue(false);

    await reader()('skukla/demo-erp');

    expect(readMock.mock.calls[0][1]).toBe('beta');
});
