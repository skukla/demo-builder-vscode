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
import { vscode, webviewClient } from '@/core/ui/utils/vscode-api';
import { NumberedInstructions } from '@/core/ui/components/ui/NumberedInstructions';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';

interface GitHubAppInstallDialogProps {
    /** GitHub repository owner */
    owner: string;
    /** GitHub repository name */
    repo: string;
    /** URL to install the AEM Code Sync app */
    installUrl: string;
    /** Error message from code sync failure */
    message: string;
    /** Called when app installation is detected */
    onInstallDetected: () => void;
}

export function GitHubAppInstallDialog({
    owner,
    repo,
    installUrl,
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
                // App not installed yet
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

    return (
        <StatusDisplay
            variant="info"
            title="GitHub App Installation Required"
            height="auto"
            actions={[
                {
                    label: 'Open Installation Page',
                    icon: <LinkOut />,
                    variant: 'secondary',
                    onPress: handleOpenInstallPage
                },
                {
                    label: 'Check Installation',
                    icon: <Refresh />,
                    variant: 'accent',
                    onPress: handleCheckInstallation
                },
            ]}
        >
            <Text UNSAFE_className="text-sm text-gray-600 mb-2">
                Code sync requires the AEM Code Sync GitHub App to be installed on <Text UNSAFE_className="font-mono font-semibold">{owner}/{repo}</Text>.
            </Text>
            
            <NumberedInstructions
                instructions={[
                    {
                        step: 'Click "Open Installation Page" below',
                        details: 'The GitHub app installation page will open in your browser.',
                    },
                    {
                        step: `Select "${owner}/${repo}" from the repository list`,
                        details: 'Choose which repositories the AEM Code Sync app can access.',
                    },
                    {
                        step: 'Click "Install" or "Save" to authorize the app',
                        details: 'The app needs read access to your repository code for content synchronization.',
                    },
                    {
                        step: 'Click "Check Installation" when complete',
                        details: 'We\'ll verify the app is installed and continue with project creation.',
                    },
                ]}
            />
            
            {hasError && (
                <Text UNSAFE_className="text-sm text-orange-700 text-center" marginTop="size-200">
                    ⚠️ App not detected yet. Please complete the installation and try again.
                </Text>
            )}
        </StatusDisplay>
    );
}
