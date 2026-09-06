/**
 * BaseCommand — the notification helpers every command inherits.
 *
 * The disposal and terminal-location suites cover what the base class OWNS; these
 * are the calls it makes on the SC's behalf, and until now nothing ran them at all.
 * Each assertion is about the arguments VS Code receives — the progress location,
 * the modal/auto-dismiss shape, the status-bar timeout — because those are what a
 * subclass gets by calling `showSuccessMessage` instead of the window API directly.
 *
 * Wording is deliberately NOT asserted: the log lines and the message text belong to
 * the caller, and pinning them here would make every copy edit a test failure.
 */

import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base/baseCommand';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';
import { createMockLogger } from '../../helpers/loggerFake';
import { createMockExtensionContext } from '../../helpers/extensionContextFake';

jest.mock('@/core/utils/sleep');

/** The protected surface these tests drive from a subclass, as its real types. */
class TestCommand extends BaseCommand {
    public async execute(): Promise<void> {
        // Nothing to do — the helpers below are the subject.
    }

    public runWithProgress<T>(
        title: string,
        task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>
    ): Promise<T> {
        return this.withProgress(title, task);
    }

    public runShowError(message: string, error?: Error): Promise<void> {
        return this.showError(message, error);
    }

    public runShowWarning(message: string): Promise<void> {
        return this.showWarning(message);
    }

    public runShowInfo(message: string): Promise<void> {
        return this.showInfo(message);
    }

    public runShowSuccessMessage(message: string, timeout?: number): Promise<void> {
        return timeout === undefined
            ? this.showSuccessMessage(message)
            : this.showSuccessMessage(message, timeout);
    }

    public runShowProgressNotification(message: string, duration?: number): Promise<void> {
        return duration === undefined
            ? this.showProgressNotification(message)
            : this.showProgressNotification(message, duration);
    }

    public runShowStatusMessage(message: string, timeout?: number): void {
        if (timeout === undefined) {
            this.showStatusMessage(message);
        } else {
            this.showStatusMessage(message, timeout);
        }
    }
}

describe('BaseCommand notification helpers', () => {
    let command: TestCommand;
    let logger: Logger;

    beforeEach(() => {
        jest.clearAllMocks();
        logger = createMockLogger() as unknown as Logger;
        const stateManager = { getCurrentProject: jest.fn() } as unknown as StateManager;
        command = new TestCommand(createMockExtensionContext(), stateManager, logger);
    });

    describe('withProgress', () => {
        it('runs the task under a non-cancellable notification and returns its value', async () => {
            const task = jest.fn().mockResolvedValue('done');

            const value = await command.runWithProgress('Deploying', task);

            expect(value).toBe('done');
            expect(vscode.window.withProgress).toHaveBeenCalledWith(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Deploying',
                    cancellable: false,
                },
                task
            );
        });
    });

    describe('the three message helpers', () => {
        it('shows an error with an OK button and logs it', async () => {
            await command.runShowError('Deploy failed', new Error('boom'));

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Deploy failed', 'OK');
            expect(logger.error).toHaveBeenCalledTimes(1);
        });

        it('shows a warning with an OK button and logs it', async () => {
            await command.runShowWarning('Nothing to deploy');

            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                'Nothing to deploy',
                'OK'
            );
            expect(logger.warn).toHaveBeenCalledTimes(1);
        });

        it('shows an information message with an OK button and logs it', async () => {
            await command.runShowInfo('Deployed');

            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Deployed', 'OK');
            expect(logger.info).toHaveBeenCalledTimes(1);
        });
    });

    describe('showProgressNotification', () => {
        it('holds an auto-dismissing notification open for the default duration', async () => {
            await command.runShowProgressNotification('Working');

            expect(vscode.window.withProgress).toHaveBeenCalledWith(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Working',
                    cancellable: false,
                },
                expect.any(Function)
            );
            expect(sleep).toHaveBeenCalledWith(TIMEOUTS.UI.NOTIFICATION);
        });

        it('holds it open for an explicit duration when one is given', async () => {
            await command.runShowProgressNotification('Working', 750);

            expect(sleep).toHaveBeenCalledWith(750);
        });
    });

    describe('showSuccessMessage', () => {
        it('shows the auto-dismissing notification and a status-bar echo', async () => {
            await command.runShowSuccessMessage('Project created');

            expect(sleep).toHaveBeenCalledWith(TIMEOUTS.UI.NOTIFICATION);
            expect(vscode.window.withProgress).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'Project created' }),
                expect.any(Function)
            );
            expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
                expect.stringContaining('Project created'),
                TIMEOUTS.STATUS_BAR_SUCCESS
            );
        });

        it('keeps the status-bar echo for an explicit timeout when one is given', async () => {
            await command.runShowSuccessMessage('Project created', 1234);

            expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
                expect.stringContaining('Project created'),
                1234
            );
            // The notification's own duration is fixed and does not follow the override.
            expect(sleep).toHaveBeenCalledWith(TIMEOUTS.UI.NOTIFICATION);
        });
    });

    describe('showStatusMessage', () => {
        it('writes to the status bar for the default info timeout, with no popup', () => {
            command.runShowStatusMessage('Refreshing');

            expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
                expect.stringContaining('Refreshing'),
                TIMEOUTS.STATUS_BAR_INFO
            );
            expect(vscode.window.withProgress).not.toHaveBeenCalled();
            expect(logger.info).toHaveBeenCalledTimes(1);
        });

        it('honours an explicit timeout', () => {
            command.runShowStatusMessage('Refreshing', 42);

            expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
                expect.stringContaining('Refreshing'),
                42
            );
        });
    });
});
