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

import React from 'react';
import type { StepPhase } from '../hooks/useCreationProgressPhase';
import type { GitHubAppInstallData } from '../hooks/useGitHubAppPreflight';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { useRunClock } from '@/core/ui/hooks/useRunClock';
import { expectationFor } from '@/core/utils/operationStages';
import { expectationLine, stageLine } from '@/core/utils/stageLine';
import { GitHubAppInstallDialog } from '@/features/eds/ui/components/GitHubAppInstallDialog';
import type { CreationProgress, WizardState } from '@/types/webview';

/** Success completion content */
function SuccessContent({ isOpeningProject, isEdit, note }: { isOpeningProject: boolean; isEdit: boolean; note?: string }) {
    if (isOpeningProject) {
        return (
            <CenteredFeedbackContainer>
                <LoadingDisplay
                    size="L"
                    message={isEdit ? 'Opening your project' : 'Loading your projects'}
                />
            </CenteredFeedbackContainer>
        );
    }

    // A whole wizard screen, so the large centred check every wizard success has (dialog design
    // rules, owner 2026-11-02). Edit's heading says it all; a second line read as a claim about the
    // project (owner, 2026-10-17). The one line worth knowing is about broken links (EDS-64).
    return (
        <StatusDisplay
            variant="success"
            title={isEdit ? 'Changes Saved' : 'Project Created'}
            message={note}
            centerMessage
            maxWidth="520px"
        />
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
        <StatusDisplay
            variant={isCancelled ? 'warning' : 'error'}
            title={isCancelled ? `${action} Cancelled` : `${action} Failed`}
            message={errorMessage}
            centerMessage
            maxWidth="520px"
        />
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
                steady
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
        return <SuccessContent isOpeningProject={isOpeningProject} isEdit={isEdit} note={progress?.note} />;
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
