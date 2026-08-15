/**
 * registerBuildStamp — the surfaces that answer "which checkout is running?".
 *
 * Three things matter and nothing else does:
 *   1. It NEVER throws. It runs early in activate(); a diagnostic that can break
 *      activation is worse than no diagnostic.
 *   2. The status bar item is Development-mode only. A user on a released VSIX
 *      has one extension and no ambiguity — shipping them a build badge would be
 *      noise in exchange for nothing.
 *   3. It logs the identity on EVERY activation, packaged included, because the
 *      log is the record that survives the window.
 */

const mockStatusBarItem = {
    text: '',
    tooltip: '',
    command: '',
    show: jest.fn(),
    dispose: jest.fn(),
};

jest.mock(
    'vscode',
    () => ({
        StatusBarAlignment: { Right: 2 },
        ExtensionMode: { Production: 1, Development: 2, Test: 3 },
        window: {
            createStatusBarItem: jest.fn(() => mockStatusBarItem),
            showInformationMessage: jest.fn(),
        },
        commands: { registerCommand: jest.fn(() => ({ dispose: jest.fn() })) },
    }),
    { virtual: true }
);

const mockRead = jest.fn();
jest.mock('@/core/build/buildInfo', () => ({
    readBuildInfo: (...a: unknown[]) => mockRead(...a),
    describeBuildInfo: (i: { branch: string; commit: string }) => `${i.branch}@${i.commit} desc`,
    isDistStale: jest.fn(() => false),
    newestMtimeUnder: jest.fn(async () => 0),
}));

import * as vscode from 'vscode';
import { registerBuildStamp } from '@/core/build/buildStampUi';

const INFO = {
    checkoutPath: '/checkout/main',
    branch: 'develop',
    commit: '54bcbcb9',
    dirty: false,
    builtAt: '2026-08-12T08:36:25.000Z',
};

function ctx(mode: number) {
    return {
        extensionPath: '/checkout/main',
        extensionMode: mode,
        subscriptions: [] as unknown[],
    } as unknown as vscode.ExtensionContext;
}

const logger = { debug: jest.fn() };

beforeEach(() => {
    jest.clearAllMocks();
    mockRead.mockResolvedValue(INFO);
});

describe('registerBuildStamp', () => {
    it('pins the branch and commit to the status bar in Development mode', async () => {
        await registerBuildStamp(ctx(2), logger);

        expect(vscode.window.createStatusBarItem).toHaveBeenCalled();
        expect(mockStatusBarItem.text).toContain('develop@54bcbcb9');
        expect(mockStatusBarItem.show).toHaveBeenCalled();
    });

    it('marks a dirty tree so an uncommitted build never reads as its commit', async () => {
        mockRead.mockResolvedValue({ ...INFO, dirty: true });

        await registerBuildStamp(ctx(2), logger);

        expect(mockStatusBarItem.text).toContain('54bcbcb9+');
    });

    it('adds NO status item in Production — users have one extension, not three', async () => {
        await registerBuildStamp(ctx(1), logger);

        expect(vscode.window.createStatusBarItem).not.toHaveBeenCalled();
    });

    it('logs the identity even in Production — the log outlives the window', async () => {
        await registerBuildStamp(ctx(1), logger);

        expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('develop@54bcbcb9'));
    });

    it('says so and adds nothing when the stamp is missing', async () => {
        mockRead.mockResolvedValue(undefined);

        await registerBuildStamp(ctx(2), logger);

        expect(logger.debug).toHaveBeenCalledWith(expect.stringMatching(/build identity unknown/i));
        expect(vscode.window.createStatusBarItem).not.toHaveBeenCalled();
    });

    it('registers the detail command so the badge is clickable', async () => {
        await registerBuildStamp(ctx(2), logger);

        expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
            'demoBuilder.showBuildInfo',
            expect.any(Function)
        );
        expect(mockStatusBarItem.command).toBe('demoBuilder.showBuildInfo');
    });

    it('disposes the status item with the extension', async () => {
        const c = ctx(2);

        await registerBuildStamp(c, logger);

        expect(c.subscriptions).toContain(mockStatusBarItem);
    });
});
