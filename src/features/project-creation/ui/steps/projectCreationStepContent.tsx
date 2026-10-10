/**
 * The body of the final wizard step: one view per phase — the GitHub App install
 * dialog, the running operation with its stage expectation, the success and
 * error/cancelled views, and the initializing window before the first progress
 * event. No wizard logic lives here; ProjectCreationStep derives the flags and
 * hands them in.
 *
 * Moved out of ProjectCreationStep.tsx on 2026-10-08 (EDS-8).
 *
 * @module features/project-creation/ui/steps/projectCreationStepContent
 */

import { Text, Flex } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React from 'react';
import type { StepPhase } from '../hooks/useCreationProgressPhase';
import type { GitHubAppInstallData } from '../hooks/useGitHubAppPreflight';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { expectationFor } from '@/core/utils/operationStages';
import { GitHubAppInstallDialog } from '@/features/eds/ui/components/GitHubAppInstallDialog';
import { WizardState } from '@/types/webview';

/** Success completion content */
function SuccessContent({ isOpeningProject }: { isOpeningProject: boolean }) {
    if (isOpeningProject) {
        return (
            <CenteredFeedbackContainer>
                <LoadingDisplay size="L" message="Loading your projects" />
            </CenteredFeedbackContainer>
        );
    }

    return (
        <CenteredFeedbackContainer>
            <Flex direction="column" gap="size-200" alignItems="center" maxWidth="520px">
                <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
                <Flex direction="column" gap="size-100" alignItems="center">
                    <Text UNSAFE_className="text-xl font-medium">Project Created Successfully</Text>
                    <Text UNSAFE_className="text-sm text-gray-600 text-center">
                        Click below to view your projects
                    </Text>
                </Flex>
            </Flex>
        </CenteredFeedbackContainer>
    );
}

/** Error/cancelled state content */
function ErrorContent({
    isCancelled,
    errorMessage,
}: {
    isCancelled: boolean;
    errorMessage?: string;
}) {
    return (
        <CenteredFeedbackContainer>
            <Flex direction="column" gap="size-200" alignItems="center" maxWidth="520px">
                <AlertCircle size="L" UNSAFE_className="text-red-600" />
                <Flex direction="column" gap="size-100" alignItems="center">
                    <Text UNSAFE_className="text-xl font-medium">
                        {isCancelled ? 'Project Creation Cancelled' : 'Project Creation Failed'}
                    </Text>
                    {errorMessage && (
                        <Text UNSAFE_className="text-sm text-gray-600">{errorMessage}</Text>
                    )}
                </Flex>
            </Flex>
        </CenteredFeedbackContainer>
    );
}

/** Main content area - renders the appropriate content for each phase */
export function StepContentArea(props: {
    phase: StepPhase;
    progress: WizardState['creationProgress'];
    isActive: boolean;
    isCompleted: boolean;
    isOpeningProject: boolean;
    showGenericError: boolean;
    isCancelled: boolean;
    githubAppInstallData: GitHubAppInstallData | null;
    onGitHubAppInstalled: () => void;
}) {
    const {
        phase,
        progress,
        isActive,
        isCompleted,
        isOpeningProject,
        showGenericError,
        isCancelled,
        githubAppInstallData,
        onGitHubAppInstalled,
    } = props;

    if (phase === 'github-app-install' && githubAppInstallData) {
        return (
            <GitHubAppInstallDialog
                owner={githubAppInstallData.owner}
                repo={githubAppInstallData.repo}
                installUrl={githubAppInstallData.installUrl}
                message={githubAppInstallData.message}
                onInstallDetected={onGitHubAppInstalled}
            />
        );
    }

    if (isActive && progress) {
        return (
            <CenteredFeedbackContainer>
                <LoadingDisplay
                    size="L"
                    message={progress.currentOperation || 'Processing'}
                    subMessage={progress.message}
                    // The stage's OWN expectation where the shared table names
                    // it, so this screen says what every other surface says
                    // about the same work; the whole-run estimate is the
                    // fallback for a stage the table does not name (PL-59
                    // slice 8).
                    helperText={
                        expectationFor(progress.currentOperation ?? '') ??
                        'This could take up to 3 minutes'
                    }
                />
            </CenteredFeedbackContainer>
        );
    }

    if (isCompleted && !progress?.error) {
        return <SuccessContent isOpeningProject={isOpeningProject} />;
    }

    if (showGenericError) {
        return <ErrorContent isCancelled={isCancelled} errorMessage={progress?.error} />;
    }

    if (phase === 'creating' && !progress) {
        return (
            <CenteredFeedbackContainer>
                <LoadingDisplay
                    size="L"
                    message="Initializing"
                    subMessage="Preparing to create your project"
                />
            </CenteredFeedbackContainer>
        );
    }

    return null;
}
