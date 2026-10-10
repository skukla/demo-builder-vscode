/**
 * The final wizard step: project creation. Wires the phase the screen is in
 * (`useCreationProgressPhase`) and the GitHub App pre-flight
 * (`useGitHubAppPreflight`) to the body (`projectCreationStepContent`) and the
 * footer (`projectCreationStepFooter`). Split by job on 2026-10-08 (EDS-8).
 *
 * @module features/project-creation/ui/steps/ProjectCreationStep
 */

import React from 'react';
import { useCreationProgressPhase } from '../hooks/useCreationProgressPhase';
import { useGitHubAppPreflight } from '../hooks/useGitHubAppPreflight';
import { StepContentArea } from './projectCreationStepContent';
import { StepFooterArea } from './projectCreationStepFooter';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { DemoPackage } from '@/types/demoPackages';
import { WizardState } from '@/types/webview';
import type { ImportedSettings } from '@/types/wizard';

interface ProjectCreationStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    onBack: () => void;
    importedSettings?: ImportedSettings | null;
    packages?: DemoPackage[];
}

export function ProjectCreationStep({
    state,
    onBack,
    importedSettings,
    packages,
}: ProjectCreationStepProps) {
    const progress = state.creationProgress;
    const {
        phase,
        setPhase,
        isCancelling,
        isOpeningProject,
        isCancelled,
        isCompleted,
        isActive,
        showGenericError,
        isGitHubAppInstall,
        handleCancel,
        handleOpenProject,
    } = useCreationProgressPhase(progress);
    const { githubAppInstallData, handleGitHubAppInstalled } = useGitHubAppPreflight({
        state,
        importedSettings,
        packages,
        setPhase,
    });

    return (
        <div className="flex-column h-full w-full">
            <div className="flex-1 flex w-full">
                <SingleColumnLayout>
                    <StepContentArea
                        phase={phase}
                        progress={progress}
                        isActive={isActive}
                        isCompleted={isCompleted}
                        isOpeningProject={isOpeningProject}
                        showGenericError={showGenericError}
                        isCancelled={isCancelled}
                        githubAppInstallData={githubAppInstallData}
                        onGitHubAppInstalled={handleGitHubAppInstalled}
                    />
                </SingleColumnLayout>
            </div>

            <StepFooterArea
                isActive={isActive}
                // The body already treats this window as its own state
                // (`phase === 'creating' && !progress`); the footer now agrees.
                isStarting={phase === 'creating' && !progress}
                isGitHubAppInstall={isGitHubAppInstall}
                isCompleted={isCompleted}
                isOpeningProject={isOpeningProject}
                showGenericError={showGenericError}
                isCancelling={isCancelling}
                hasError={!!progress?.error}
                onBack={onBack}
                onCancel={handleCancel}
                onOpenProject={handleOpenProject}
            />
        </div>
    );
}
