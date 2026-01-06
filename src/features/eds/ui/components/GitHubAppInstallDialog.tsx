/**
 * GitHub App Install Dialog
 *
 * Dialog displayed when EDS code sync fails due to missing AEM Code Sync GitHub app.
 * Follows the same pattern as MeshErrorDialog - pauses creation, shows instructions,
 * and allows user to continue after installing the app.
 */

import { Flex, Text, DialogTrigger, ActionButton } from '@adobe/react-spectrum';
import InfoOutline from '@spectrum-icons/workflow/InfoOutline';
import React from 'react';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { Modal } from '@/core/ui/components/ui/Modal';
import { NumberedInstructions } from '@/core/ui/components/ui/NumberedInstructions';
import { vscode } from '@/core/ui/utils/vscode-api';

interface GitHubAppInstallDialogProps {
    /** GitHub repository owner */
    owner: string;
    /** GitHub repository name */
    repo: string;
    /** URL to install the AEM Code Sync app */
    installUrl: string;
    /** Error message from code sync failure */
    message: string;
    /** Called when user clicks Continue after installing app */
    onRetry: () => void;
    /** Called when user clicks Back */
    onBack: () => void;
}

/**
 * Installation instructions for the AEM Code Sync app
 */
const INSTALL_INSTRUCTIONS = [
    {
        step: 'Click "Open Installation Page" below',
        details: 'This opens the Helix admin page for app installation.',
    },
    {
        step: 'Review the app permissions and click "Install & Authorize"',
        details: 'The app needs read access to your repository code.',
    },
    {
        step: 'Return to this window and click "Continue"',
        details: 'The setup will resume and verify code sync.',
    },
];

export function GitHubAppInstallDialog({
    owner,
    repo,
    installUrl,
    message,
    onRetry,
    onBack,
}: GitHubAppInstallDialogProps) {
    const handleOpenInstallPage = () => {
        vscode.postMessage({ type: 'openExternal', url: installUrl });
    };

    return (
        <StatusDisplay
            variant="warning"
            title="GitHub App Installation Required"
            message={message}
            actions={[
                { label: 'Continue', variant: 'accent', onPress: onRetry },
                { label: 'Back', variant: 'secondary', onPress: onBack },
            ]}
        >
            <Flex direction="column" gap="size-100" marginTop="size-200" alignItems="center">
                <Text UNSAFE_className="text-sm text-gray-600">
                    Code sync requires the AEM Code Sync GitHub App on {owner}/{repo}.
                </Text>
                <DialogTrigger type="modal">
                    <ActionButton isQuiet>
                        <InfoOutline />
                        <Text>View Installation Instructions</Text>
                    </ActionButton>
                    {(close) => (
                        <Modal
                            title="Install AEM Code Sync App"
                            actionButtons={[
                                {
                                    label: 'Open Installation Page',
                                    variant: 'accent',
                                    onPress: handleOpenInstallPage,
                                },
                            ]}
                            onClose={close}
                        >
                            <NumberedInstructions
                                description={`Install the AEM Code Sync app on ${owner}/${repo}:`}
                                instructions={INSTALL_INSTRUCTIONS}
                            />
                        </Modal>
                    )}
                </DialogTrigger>
            </Flex>
        </StatusDisplay>
    );
}
