import * as vscode from 'vscode';
import { resetAiOnboardingState } from '@/commands/openInClaude';
import { BaseCommand } from '@/core/base/baseCommand';

/**
 * Dev-only convenience command for testing the first-run AI experience
 * (clipboard-fallback tip, pending-launch replay) repeatedly without nuking
 * projects, Adobe auth, or other state.
 *
 * Scope: clears the active AI one-time flags AND the legacy flags / settings
 * left over from the retired extension surface and dock-to-right offer, so
 * users upgrading from a previous Demo Builder don't carry dead state.
 * Projects, Adobe auth, DA.live config, and globalState outside AI are
 * untouched.
 */
export class ResetAiOnboardingCommand extends BaseCommand {
    public async execute(): Promise<void> {
        try {
            const isDevelopment = this.context.extensionMode === vscode.ExtensionMode.Development;
            if (!isDevelopment) {
                vscode.window.showWarningMessage(
                    'Reset AI Onboarding is only available in development mode.',
                );
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                'Reset the AI onboarding state? Clears the clipboard-fallback tip flag and the '
                + 'pending-launch record, plus legacy flags and settings from the retired extension '
                + 'surface. Projects, Adobe auth, and other settings are untouched.',
                { modal: true },
                'Yes, Reset AI Onboarding',
                'Cancel',
            );
            if (confirm !== 'Yes, Reset AI Onboarding') {
                return;
            }

            await resetAiOnboardingState(this.context);
            this.logger.info('[ResetAiOnboarding] AI onboarding state cleared (flags + settings)');

            vscode.window.showInformationMessage(
                'AI onboarding state reset. Click an AI prompt to see the first-run flow again.',
            );
        } catch (error) {
            await this.showError('Failed to reset AI onboarding', error as Error);
        }
    }
}
