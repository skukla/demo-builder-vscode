/**
 * GitHub App Install Message
 *
 * Wizard step message displayed when EDS code sync requires the AEM Code Sync GitHub app.
 * Uses StatusDisplay and NumberedInstructions to match the mesh modal's look and feel.
 */

import { Text } from '@adobe/react-spectrum';
import LinkOut from '@spectrum-icons/workflow/LinkOut';
import Refresh from '@spectrum-icons/workflow/Refresh';
import React, { useState } from 'react';
import {
    CODE_SYNC_INSTALL_ACTION,
    CODE_SYNC_RECHECK_ACTION,
    buildCodeSyncInstallSteps,
    buildCodeSyncInstallSummary,
} from '../helpers/codeSyncInstallContent';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { NumberedInstructions } from '@/core/ui/components/ui/NumberedInstructions';
import { vscode, webviewClient } from '@/core/ui/utils/vscode-api';

interface GitHubAppInstallDialogProps {
    /** GitHub repository owner */
    owner: string;
    /** GitHub repository name */
    repo: string;
    /** URL to install the AEM Code Sync app */
    installUrl: string;
    /** Error message from code sync failure */
    message: string;
    /**
     * Helix has no SITE for this repo (outer HTTP 404), as opposed to knowing
     * the site and reporting no code sync for it (`code.status: 404`).
     *
     * `/status` reports on the site, so this says NOTHING about whether the App
     * is installed — and an install cannot resolve it. Measured on
     * skukla/kukla-bodea 2026-08-20: GitHub listed the repo under the AEM Code
     * Sync installation and the endpoint 404'd anyway. Drives a different title,
     * body and action order below.
     */
    siteUnregistered?: boolean;
    /** Called when app installation is detected */
    onInstallDetected: () => void;
}

export function GitHubAppInstallDialog({
    owner,
    repo,
    installUrl,
    siteUnregistered = false,
    onInstallDetected,
}: GitHubAppInstallDialogProps) {
    const [isChecking, setIsChecking] = useState(false);
    const [hasError, setHasError] = useState(false);

    const handleOpenInstallPage = () => {
        // Open the URL in the system browser via VS Code API
        vscode.postMessage('openExternal', { url: installUrl });
    };

    const handleCheckInstallation = async () => {
        setIsChecking(true);
        setHasError(false);

        try {
            // Use lenient mode for post-install verification (user just installed the app)
            const result = await webviewClient.request<{
                success: boolean;
                isInstalled: boolean;
            }>('check-github-app', { owner, repo, lenient: true });

            if (result.success && result.isInstalled) {
                onInstallDetected();
            } else {
                setHasError(true);
            }
        } catch (error) {
            console.error('[GitHub App] Check failed:', error);
            setHasError(true);
        } finally {
            setIsChecking(false);
        }
    };

    // Show loading state while checking for app installation
    if (isChecking) {
        return (
            <CenteredFeedbackContainer>
                <LoadingDisplay
                    size="L"
                    message="Checking for GitHub App Installation"
                    subMessage={`Verifying ${owner}/${repo}...`}
                />
            </CenteredFeedbackContainer>
        );
    }

    // Helix has no site for this repo. An install flow cannot fix that, so it is
    // not what this screen leads with -- Check Again is the action, and Install
    // App stays only as a secondary "if you have not already".
    if (siteUnregistered) {
        return (
            <StatusDisplay
                variant="info"
                title="Waiting for Adobe to register your repository"
                height="auto"
                actions={[
                    {
                        label: CODE_SYNC_RECHECK_ACTION,
                        icon: <Refresh />,
                        variant: 'accent',
                        onPress: handleCheckInstallation,
                    },
                    {
                        label: CODE_SYNC_INSTALL_ACTION,
                        icon: <LinkOut />,
                        variant: 'secondary',
                        onPress: handleOpenInstallPage,
                    },
                ]}
            >
                <Text UNSAFE_className="text-sm text-gray-600 text-center">
                    {`Adobe does not have a site for ${owner}/${repo} yet. This usually ` +
                        'settles within a minute or two of the repository being set up.'}
                </Text>
                {hasError && (
                    <Text
                        UNSAFE_className="text-sm text-orange-700 text-center"
                        marginTop="size-200"
                    >
                        {/* Deliberately NOT "the App is missing". We cannot see the App
                            from here, and saying so is what sent someone through eleven
                            reinstalls. If it never settles, AEM Code Sync not being
                            installed is ONE possible cause, offered as such. */}
                        ⚠️ Still not registered. If this persists, check that AEM Code
                        Sync has access to this repository.
                    </Text>
                )}
            </StatusDisplay>
        );
    }

    return (
        <StatusDisplay
            variant="info"
            title="GitHub App Installation Required"
            height="auto"
            actions={[
                {
                    label: CODE_SYNC_INSTALL_ACTION,
                    icon: <LinkOut />,
                    variant: 'accent',
                    onPress: handleOpenInstallPage,
                },
                {
                    label: CODE_SYNC_RECHECK_ACTION,
                    icon: <Refresh />,
                    variant: 'secondary',
                    onPress: handleCheckInstallation,
                },
            ]}
        >
            {/* The lead-in is shared too. This surface had written its own, which
                is the drift the steps below were already extracted to stop. */}
            <NumberedInstructions
                description={buildCodeSyncInstallSummary(owner, repo)}
                instructions={buildCodeSyncInstallSteps(owner, repo)}
            />

            {hasError && (
                <Text UNSAFE_className="text-sm text-orange-700 text-center" marginTop="size-200">
                    {/* This branch is now reached ONLY for a measured inner 404 --
                        Helix knows the site and reports no code sync -- so the
                        install advice is warranted. The old `codeStatus === undefined`
                        arm claimed "still being registered ... for new repositories"
                        about the outer 404, which is a different repo state entirely
                        and is handled above. */}
                    ⚠️ App not detected yet. Please complete the installation and try again.
                </Text>
            )}
        </StatusDisplay>
    );
}
