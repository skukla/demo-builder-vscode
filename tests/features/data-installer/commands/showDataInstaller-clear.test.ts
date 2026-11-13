/**
 * The Command Palette's Clear doors (step 06 C5, P6-Q5): `demoBuilder.clearDemoData` and
 * `demoBuilder.clearCommerceInstance` open the current project's Datapacks with that window open.
 * A screen not open yet takes the request once mounted (`takeClearRequest`); one already open is
 * pushed `openClearWindow`, the projects list's Delete arrival again. Refused, with a message, when
 * no project is open or it has no Commerce backend: nothing opens and nothing is held.
 */

import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { handleTakeClearRequest } from '@/features/data-installer/handlers/clearWindowRequest';
import type { Project } from '@/types/base';
import type { ClearWindowKind, OpenClearWindowPayload } from '@/types/demoDataWipe';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockWebviewPanel } from '../../../helpers/webviewPanelFake';
import { makeDataInstallerCommand, type BuiltDataInstallerCommand } from './showDataInstaller.testUtils';

/** A project with this backend selection; `undefined` for one with none. */
function projectWith(backend: string | undefined): Project {
    return createMockProject({ componentSelections: { backend } });
}

type Opened = {
    command: BuiltDataInstallerCommand['command'];
    execute: jest.SpyInstance;
    sendMessage: jest.Mock;
};

/** The project's Datapacks command over this current project, its opening and pushing recorded. */
function commandFor(project: Project | undefined): Opened {
    const { command } = makeDataInstallerCommand('project', project);
    const execute = jest.spyOn(command, 'execute').mockResolvedValue(undefined);
    const sendMessage = jest.fn().mockResolvedValue(undefined);
    (command as unknown as { sendMessage: jest.Mock }).sendMessage = sendMessage;
    return { command, execute, sendMessage };
}

/** Whether a Datapacks screen is already open. */
function panelOpen(open: boolean): void {
    jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue(
        open ? createMockWebviewPanel() : undefined
    );
}

/** What the next screen to mount takes. */
async function taken(): Promise<unknown> {
    const response = await handleTakeClearRequest(createMockHandlerContext(), undefined);
    return response.data?.window;
}

beforeEach(async () => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    await taken();
});

describe.each<[ClearWindowKind]>([['project'], ['instance']])(
    'opening the %s Clear window',
    (window) => {
        it('opens a screen not open yet, holding the window for it to take once mounted', async () => {
            panelOpen(false);
            const { command, execute, sendMessage } = commandFor(projectWith('adobe-commerce-accs'));

            await command.openClearWindow(window);

            expect(execute).toHaveBeenCalledTimes(1);
            expect(sendMessage).not.toHaveBeenCalledWith('openClearWindow', expect.anything());
            expect(await taken()).toBe(window);
            // Used up: a second screen opens nothing.
            expect(await taken()).toBeNull();
        });

        it('pushes the window to a screen already open, and holds nothing', async () => {
            panelOpen(true);
            const { command, execute, sendMessage } = commandFor(projectWith('adobe-commerce-paas'));

            await command.openClearWindow(window);

            const payload: OpenClearWindowPayload = { window };
            expect(execute).toHaveBeenCalledTimes(1);
            expect(sendMessage).toHaveBeenCalledWith('openClearWindow', payload);
            expect(execute.mock.invocationCallOrder[0]).toBeLessThan(
                sendMessage.mock.invocationCallOrder[0]
            );
            expect(await taken()).toBeNull();
        });

        it.each<[string, Project | undefined, RegExp]>([
            ['no project is open', undefined, /^Open a project before clearing/],
            [
                'the project has no Commerce backend',
                projectWith(undefined),
                /no Adobe Commerce backend/,
            ],
        ])(
            'is refused with a message when %s: nothing opens, nothing is held',
            async (_why, project, words) => {
                panelOpen(false);
                const { command, execute, sendMessage } = commandFor(project);

                await command.openClearWindow(window);

                expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                    expect.stringMatching(words)
                );
                expect(execute).not.toHaveBeenCalled();
                expect(sendMessage).not.toHaveBeenCalled();
                expect(await taken()).toBeNull();
            }
        );
    }
);

it('names the action it refused', async () => {
    const { command } = commandFor(undefined);

    await command.openClearWindow('project');
    await command.openClearWindow('instance');

    expect(
        (vscode.window.showWarningMessage as jest.Mock).mock.calls.map((call) => call[0])
    ).toEqual([
        'Open a project before clearing its demo data.',
        'Open a project before clearing its Commerce instance.',
    ]);
});

it('registers takeClearRequest on the panel, so the screen can ask', () => {
    const command = commandFor(undefined).command as unknown as {
        initializeMessageHandlers(comm: { onStreaming: jest.Mock }): void;
    };
    const onStreaming = jest.fn();

    command.initializeMessageHandlers({ onStreaming });

    expect(onStreaming.mock.calls.map((call) => call[0])).toContain('takeClearRequest');
});
