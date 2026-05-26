import * as vscode from 'vscode';
import { resetAiOnboardingState } from '@/commands/openInClaude';
import { BaseCommand } from '@/core/base/baseCommand';

/**
 * Dev-only convenience command for testing the first-run AI experience
 * (dock-to-right offer, extension-detected offer, sessions-browser auto-open,
 * etc.) repeatedly without nuking projects, Adobe auth, or other state.
 *
 * Scope: clears the AI one-time toast flags AND the AI user-settings AND the
 * synced `claudeCode.preferredLocation`. Nothing else. Projects, Adobe auth,
 * DA.live config, and globalState outside AI are untouched.
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
                'Reset the AI onboarding state? Clears the dock-offer / extension-offer / '
                + 'sessions-browser-auto-open flags and resets `demoBuilder.ai.dockToRight`, '
                + '`demoBuilder.ai.surface`, and `claudeCode.preferredLocation` to their defaults. '
                + 'Projects, Adobe auth, and other settings are untouched.',
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
