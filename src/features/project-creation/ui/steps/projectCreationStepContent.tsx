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
import { useRunClock } from '@/core/ui/hooks/useRunClock';
import { expectationFor } from '@/core/utils/operationStages';
import { expectationLine, stageLine } from '@/core/utils/stageLine';
import { GitHubAppInstallDialog } from '@/features/eds/ui/components/GitHubAppInstallDialog';
import type { CreationProgress, WizardState } from '@/types/webview';

/** Success completion content */
function SuccessContent({ isOpeningProject, isEdit }: { isOpeningProject: boolean; isEdit: boolean }) {
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
                    <Text UNSAFE_className="text-xl font-medium">
                        {isEdit ? 'Changes Saved' : 'Project Created Successfully'}
                    </Text>
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
    isEdit,
}: {
    isCancelled: boolean;
    errorMessage?: string;
    isEdit: boolean;
}) {
    const action = isEdit ? 'Saving Changes' : 'Project Creation';
    return (
        <CenteredFeedbackContainer>
            <Flex direction="column" gap="size-200" alignItems="center" maxWidth="520px">
                <AlertCircle size="L" UNSAFE_className="text-red-600" />
                <Flex direction="column" gap="size-100" alignItems="center">
                    <Text UNSAFE_className="text-xl font-medium">
                        {isCancelled ? `${action} Cancelled` : `${action} Failed`}
                    </Text>
                    {errorMessage && (
                        <Text UNSAFE_className="text-sm text-gray-600">{errorMessage}</Text>
                    )}
                </Flex>
            </Flex>
        </CenteredFeedbackContainer>
    );
}

/** What the screen expects of a stage the table does not name. */
const WHOLE_RUN_ESTIMATE = 'This could take up to 3 minutes';

/**
 * The running view: the same three lines as every progress surface (progress
 * vocabulary, owner 2026-10-16). The step with its place in the run, "(4 of 9)";
 * what it is doing now; the step's expectation with the whole run's clock.
 */
function RunningContent({ progress }: { progress: CreationProgress }) {
    const clock = useRunClock(progress.startedAt);
    const stage = progress.currentOperation;
    return (
        <CenteredFeedbackContainer>
            <LoadingDisplay
                size="L"
                message={stage ? stageLine(stage, progress.position) : 'Processing'}
                subMessage={progress.message}
                // The stage's OWN expectation where the shared table names it, so
                // this screen says what every other surface says about the same
                // work; the whole-run estimate is the fallback for a stage the
                // table does not name (PL-59 slice 8).
                helperText={expectationLine(expectationFor(stage) ?? WHOLE_RUN_ESTIMATE, clock)}
            />
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
    /** Edit says "Changes Saved", not "Project Created" (PL-75). */
    isEdit?: boolean;
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
        isEdit = false,
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
        return <RunningContent progress={progress} />;
    }

    if (isCompleted && !progress?.error) {
        return <SuccessContent isOpeningProject={isOpeningProject} isEdit={isEdit} />;
    }

    if (showGenericError) {
        return (
            <ErrorContent isCancelled={isCancelled} errorMessage={progress?.error} isEdit={isEdit} />
        );
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
