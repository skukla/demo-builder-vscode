/**
 * The GitHub App pre-flight of the final wizard step. For an EDS stack it asks the
 * extension whether the AEM Code Sync App is installed on the project's repository
 * BEFORE creation starts, holds the step on the install dialog when it is not, and
 * starts creation (from the state as it stands, not as it was at mount) once the
 * install is detected. It also owns the listener for a `creationFailed` push that
 * names the App, which routes the step into the same dialog after creation has
 * already failed.
 *
 * The step owns the phase (`useCreationProgressPhase`) and hands `setPhase` in.
 *
 * Moved out of ProjectCreationStep.tsx on 2026-10-08 (EDS-8).
 *
 * @module features/project-creation/ui/hooks/useGitHubAppPreflight
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { buildProjectConfig } from '../wizard/wizardHelpers';
import type { StepPhase } from './useCreationProgressPhase';
import { vscode, webviewClient } from '@/core/ui/utils/vscode-api';
import { DemoPackage } from '@/types/demoPackages';
import { WizardState } from '@/types/webview';
import type { CreationFailedPayload } from '@/types/webviewPayloads';
import type { ImportedSettings } from '@/types/wizard';

/**
 * The config builder's warnings go to the extension's Debug Logs channel (PL-65):
 * a saved project can trip them, and the webview console is where no SC looks.
 * Module-level so the callbacks below do not take a new function every render.
 */
const warnToDebugLogs = (message: string): void => webviewClient.log('warn', message);

export interface GitHubAppInstallData {
    owner: string;
    repo: string;
    installUrl: string;
    message: string;
}

/** Extract GitHub owner/repo from EDS config for GitHub App check */
function extractGitHubRepoInfo(edsConfig: WizardState['edsConfig']): {
    owner?: string;
    repo?: string;
} {
    if (!edsConfig) return {};

    const authenticatedUser = edsConfig.githubAuth?.user?.login;

    if (edsConfig.existingRepo && edsConfig.existingRepo.includes('/')) {
        const [owner, repo] = edsConfig.existingRepo.split('/');
        return { owner, repo };
    }
    if (edsConfig.selectedRepo) {
        return { owner: edsConfig.selectedRepo.owner, repo: edsConfig.selectedRepo.name };
    }
    if (edsConfig.repoName && authenticatedUser) {
        return { owner: authenticatedUser, repo: edsConfig.repoName };
    }
    return {};
}

/** Handle creation failure messages and detect GitHub App install requirement */
function handleCreationFailedMessage(
    data: unknown,
    setGitHubAppInstallData: (data: GitHubAppInstallData | null) => void,
    setPhase: (phase: StepPhase) => void,
): void {
    const failedData = data as Partial<CreationFailedPayload>;

    if (failedData.errorType === 'GITHUB_APP_NOT_INSTALLED' && failedData.errorDetails) {
        const { owner, repo, installUrl } = failedData.errorDetails;
        if (owner && repo && installUrl) {
            setGitHubAppInstallData({
                owner,
                repo,
                installUrl,
                message: 'GitHub App installation required for code sync',
            });
            setPhase('github-app-install');
        }
    }
}

export interface UseGitHubAppPreflightOptions {
    state: WizardState;
    importedSettings?: ImportedSettings | null;
    packages?: DemoPackage[];
    setPhase: (phase: StepPhase) => void;
}

export interface GitHubAppPreflight {
    githubAppInstallData: GitHubAppInstallData | null;
    /** Called by the install dialog when polling detects the app is now installed. */
    handleGitHubAppInstalled: () => void;
}

/**
 * Runs the pre-flight check on mount and starts creation when it passes.
 *
 * @param options - the wizard state the config is built from, and the step's `setPhase`
 * @returns the install dialog's data (null until the check says the App is missing)
 *   and the callback the dialog fires once the install is detected
 */
export function useGitHubAppPreflight({
    state,
    importedSettings,
    packages,
    setPhase,
}: UseGitHubAppPreflightOptions): GitHubAppPreflight {
    const [githubAppInstallData, setGitHubAppInstallData] = useState<GitHubAppInstallData | null>(
        null,
    );

    const needsGitHubAppCheck = useMemo(() => {
        const stackId = state.selectedStack;
        if (!stackId) return false;
        // Check if this is an EDS stack
        return stackId.includes('eds');
    }, [state.selectedStack]);

    /**
     * Check GitHub App installation for EDS projects
     */
    const checkGitHubApp = useCallback(async () => {
        if (!needsGitHubAppCheck || !state.edsConfig) {
            return true; // Not needed or no config, proceed
        }

        const { owner, repo } = extractGitHubRepoInfo(state.edsConfig);

        if (!owner || !repo) {
            return true; // Can't check without owner/repo, let it proceed and fail later if needed
        }

        try {
            const result = await webviewClient.request<{
                success: boolean;
                isInstalled: boolean;
                undetermined?: boolean;
                reason?: string;
                installUrl?: string;
                error?: string;
            }>('check-github-app', { owner, repo });

            // An undetermined check means AEM never answered — installing the App
            // cannot resolve that, so don't route the user into the install flow.
            // Creation proceeds and surfaces the real cause if it recurs.
            if (result.undetermined) {
                console.warn('[GitHub App Check] Undetermined:', result.reason);
                return true;
            }

            if (result.success && !result.isInstalled && result.installUrl) {
                // App not installed, show dialog
                setGitHubAppInstallData({
                    owner,
                    repo,
                    installUrl: result.installUrl,
                    message: 'GitHub App installation required for code sync',
                });
                setPhase('github-app-install');
                return false;
            }

            return true; // App installed or check failed (proceed anyway)
        } catch (error) {
            console.error('[GitHub App Check] Failed:', error);
            return true; // On error, proceed and let creation handle it
        }
    }, [needsGitHubAppCheck, state.edsConfig, setPhase]);

    /**
     * Run pre-flight checks before starting project creation
     */
    const runPreFlightChecks = useCallback(async () => {
        const githubAppOk = await checkGitHubApp();
        if (!githubAppOk) return;

        // All checks passed, start creation
        setPhase('creating');

        const projectConfig = buildProjectConfig(state, importedSettings, packages, warnToDebugLogs);
        vscode.createProject(projectConfig);
    }, [checkGitHubApp, state, importedSettings, packages, setPhase]);

    /**
     * Handle detected GitHub app installation
     * Called by the dialog when polling detects the app is now installed
     */
    const handleGitHubAppInstalled = useCallback(() => {
        // App now installed, proceed with creation
        setPhase('creating');
        const projectConfig = buildProjectConfig(state, importedSettings, packages, warnToDebugLogs);
        vscode.createProject(projectConfig);
    }, [state, importedSettings, packages, setPhase]);

    // Run pre-flight checks on mount
    useEffect(() => {
        runPreFlightChecks();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Listen for creationFailed messages with GITHUB_APP_NOT_INSTALLED error
    useEffect(() => {
        const unsubscribe = vscode.onMessage('creationFailed', (data: unknown) => {
            handleCreationFailedMessage(data, setGitHubAppInstallData, setPhase);
        });
        return unsubscribe;
    }, [setPhase]);

    return { githubAppInstallData, handleGitHubAppInstalled };
}
