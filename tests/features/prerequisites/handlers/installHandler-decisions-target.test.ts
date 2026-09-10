/**
 * installHandler — decision coverage (PL-22): which prerequisite an install request
 * resolves to, and the manual-install path.
 *
 * Two callers address the same handler differently — the webview by numeric index into
 * the list it was sent, an agent by the prerequisite's own id — and they fail for
 * unrelated reasons. These pin which failure each address produces, because the message
 * is what tells the caller how to correct itself.
 */

import './installHandler.mocks';

import * as vscode from 'vscode';
import { handleInstallPrerequisite } from '@/features/prerequisites/handlers/installHandler';
import type { PrerequisiteDefinition } from '@/features/prerequisites/services/types';
import type { HandlerContext } from '@/types/handlers';
import { createMockWebviewPanel } from '../../../helpers/webviewPanelFake';
import {
    createInstallHandlerContext,
    mockNodeResult,
    setupMockCommandExecutor,
    setupSharedUtilityMocks,
} from './installHandler.testUtils';

const GIT: PrerequisiteDefinition = {
    id: 'git', name: 'Git', description: 'Version control', check: { command: 'git --version' },
};
const CURL: PrerequisiteDefinition = {
    id: 'curl', name: 'curl', description: 'Transfers', check: { command: 'curl --version' },
};
const MANUAL: PrerequisiteDefinition = {
    id: 'docker', name: 'Docker', description: 'Container platform', check: { command: 'docker --version' },
};

let context: jest.Mocked<HandlerContext>;

beforeEach(() => {
    jest.clearAllMocks();
    setupMockCommandExecutor();
    setupSharedUtilityMocks();
    context = createInstallHandlerContext();
    (context.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
        steps: [{ name: 'Install', message: 'Installing', commands: [] }],
    });
});

function errorPayload(ctx: HandlerContext): unknown {
    return (ctx.sendMessage as jest.Mock).mock.calls
        .filter(([t]) => t === 'prerequisite-status')
        .map(([, p]) => p)
        .at(-1);
}

describe('addressing a prerequisite by its id', () => {
    beforeEach(() => {
        (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue({
            version: '1.0', prerequisites: [GIT, CURL],
        });
        (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue([GIT, CURL]);
    });

    it('resolves the prerequisite from the config, not from cached check state', async () => {
        context.sharedState.currentPrerequisiteStates = new Map();

        const result = await handleInstallPrerequisite(context, { prerequisiteId: 'curl' });

        expect(context.prereqManager!.resolveDependencies).toHaveBeenCalledWith([GIT, CURL]);
        expect(context.prereqManager!.getInstallSteps).toHaveBeenCalledWith(CURL, expect.anything());
        expect(result).toEqual(expect.objectContaining({ success: true }));
    });

    it('carries the resolved position onward as the row identity every push uses', async () => {
        await handleInstallPrerequisite(context, { prerequisiteId: 'curl' });

        expect((context.sendMessage as jest.Mock).mock.calls
            .filter(([t]) => t === 'prerequisite-install-complete')
            .map(([, p]) => p),
        ).toEqual([{ index: 1, continueChecking: true }]);
    });

    it('prefers the id over a numeric index when both are supplied', async () => {
        context.sharedState.currentPrerequisiteStates = new Map([
            [0, { prereq: GIT, result: mockNodeResult }],
        ]);

        await handleInstallPrerequisite(context, { prereqId: 0, prerequisiteId: 'curl' });

        expect(context.prereqManager!.getInstallSteps).toHaveBeenCalledWith(CURL, expect.anything());
    });

    it('says which id it could not find, and how to get a valid one', async () => {
        const result = await handleInstallPrerequisite(context, { prerequisiteId: 'nope' });

        expect(result).toEqual({
            success: false,
            error: 'No prerequisite with id "nope". Run check_prerequisites and use a prereqId it reports.',
            code: 'UNKNOWN',
        });
        expect(errorPayload(context)).toEqual({
            index: undefined,
            status: 'error',
            message: 'No prerequisite with id "nope". Run check_prerequisites and use a prereqId it reports.',
        });
    });

    it('says the same when there is no manager to resolve the list at all', async () => {
        const bare = createInstallHandlerContext({ prereqManager: undefined });

        const result = await handleInstallPrerequisite(bare, { prerequisiteId: 'git' });

        expect(result).toEqual({
            success: false,
            error: 'No prerequisite with id "git". Run check_prerequisites and use a prereqId it reports.',
            code: 'UNKNOWN',
        });
    });

    it('resolves against an empty list when the config carries no prerequisites', async () => {
        (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(undefined);
        (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue([]);

        await handleInstallPrerequisite(context, { prerequisiteId: 'git' });

        expect(context.prereqManager!.resolveDependencies).toHaveBeenCalledWith([]);
    });
});

describe('addressing a prerequisite by its index', () => {
    it('installs the prerequisite the check left at that index', async () => {
        context.sharedState.currentPrerequisiteStates = new Map([
            [0, { prereq: GIT, result: mockNodeResult }],
            [1, { prereq: CURL, result: mockNodeResult }],
        ]);

        await handleInstallPrerequisite(context, { prereqId: 1 });

        expect(context.prereqManager!.getInstallSteps).toHaveBeenCalledWith(CURL, expect.anything());
    });

    it('says the check has not run when that index holds nothing', async () => {
        context.sharedState.currentPrerequisiteStates = new Map();

        const result = await handleInstallPrerequisite(context, { prereqId: 4 });

        expect(result).toEqual({
            success: false,
            error: 'Prerequisite state not found for index 4. Run the prerequisites check first, or address it by prerequisiteId.',
            code: 'UNKNOWN',
        });
    });

    it('says the same, rather than crashing, when no check has populated the map at all', async () => {
        context.sharedState.currentPrerequisiteStates = undefined;

        const result = await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(result).toEqual({
            success: false,
            error: 'Prerequisite state not found for index 0. Run the prerequisites check first, or address it by prerequisiteId.',
            code: 'UNKNOWN',
        });
    });

    it('asks for one of the two addresses when the payload carries neither', async () => {
        const result = await handleInstallPrerequisite(context, {});

        expect(result).toEqual({
            success: false,
            error: 'Either prerequisiteId (preferred) or prereqId is required.',
            code: 'UNKNOWN',
        });
    });
});

describe('a prerequisite that must be installed by hand', () => {
    beforeEach(() => {
        context.sharedState.currentPrerequisiteStates = new Map([
            [0, { prereq: MANUAL, result: mockNodeResult }],
        ]);
    });

    it('points the SC at the download page and returns it, without running any step', async () => {
        (context.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [], manual: true, url: 'https://www.docker.com/get-started',
        });

        const result = await handleInstallPrerequisite(context, { prereqId: 0 });

        expect((context.sendMessage as jest.Mock).mock.calls
            .filter(([t]) => t === 'prerequisite-status')
            .map(([, p]) => p),
        ).toEqual([{
            index: 0,
            name: 'Docker',
            status: 'warning',
            message: 'Manual installation required. Open: https://www.docker.com/get-started',
            required: true,
        }]);
        expect(result).toEqual({
            success: true,
            data: { manual: true, url: 'https://www.docker.com/get-started', prerequisite: 'Docker' },
        });
        expect(context.progressUnifier!.executeStep).not.toHaveBeenCalled();
    });

    it('opens the page for a person who just clicked Install', async () => {
        (context.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [], manual: true, url: 'https://www.docker.com/get-started',
        });
        context.panel = createMockWebviewPanel();

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
        expect(vscode.Uri.parse).toHaveBeenCalledWith('https://www.docker.com/get-started');
    });

    it('does NOT open a browser window for a headless caller', async () => {
        (context.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [], manual: true, url: 'https://www.docker.com/get-started',
        });
        context.panel = undefined;

        const result = await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(vscode.env.openExternal).not.toHaveBeenCalled();
        expect(result).toEqual(expect.objectContaining({ success: true }));
    });

    it('marks an optional manual prerequisite as not required', async () => {
        context.sharedState.currentPrerequisiteStates = new Map([
            [0, { prereq: { ...MANUAL, optional: true }, result: mockNodeResult }],
        ]);
        (context.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [], manual: true, url: 'https://www.docker.com/get-started',
        });

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect((context.sendMessage as jest.Mock).mock.calls
            .filter(([t]) => t === 'prerequisite-status')
            .map(([, p]) => p),
        ).toEqual([expect.objectContaining({ required: false })]);
    });

    it('installs normally when a plan is flagged manual but names no page to open', async () => {
        (context.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [{ name: 'Install', message: 'Installing', commands: [] }],
            manual: true,
        });

        const result = await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(context.progressUnifier!.executeStep).toHaveBeenCalledTimes(1);
        expect(vscode.env.openExternal).not.toHaveBeenCalled();
        expect(result).toEqual(expect.objectContaining({
            data: { installed: expect.objectContaining({ id: 'docker' }) },
        }));
    });

    it('installs normally when a plan names a page but is not flagged manual', async () => {
        (context.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [{ name: 'Install', message: 'Installing', commands: [] }],
            url: 'https://www.docker.com/get-started',
        });

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(context.progressUnifier!.executeStep).toHaveBeenCalledTimes(1);
        expect(vscode.env.openExternal).not.toHaveBeenCalled();
    });

    it('fails with a named error when the manager has no plan for the prerequisite', async () => {
        (context.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue(null);

        expect(await handleInstallPrerequisite(context, { prereqId: 0 })).toEqual({
            success: false,
            error: 'No installation steps defined for Docker',
            code: 'UNKNOWN',
        });
    });
});
