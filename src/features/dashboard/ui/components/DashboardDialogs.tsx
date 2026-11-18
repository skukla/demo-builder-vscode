/**
 * DashboardDialogs — everything the project dashboard can open ON TOP of
 * itself: Change source, Share Demo, Save as Package, the long-operation
 * progress modal, the Reset batch window, the AI capability catalog, and the
 * Finish Setup guide (PL-101).
 *
 * Split out of `ProjectDashboardScreen` (EDS-8, 2026-10-09): the screen decides
 * what the dashboard SHOWS; this decides which dialog is mounted over it. The
 * open state stays with the screen, because the buttons that open each dialog
 * live there. Every dialog except the progress modal is mounted only while
 * open, so the dashboard at rest carries none of them.
 *
 * @module features/dashboard/ui/components/DashboardDialogs
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import type { UseDashboardStatusReturn } from '../hooks/dashboardStatusTypes';
import type { FinishSetupControls } from '../hooks/useFinishSetup';
import type { HandoverDialogs } from '../hooks/useHandoverDialogs';
import { AiCapabilitiesModal } from './AiCapabilitiesModal';
import { FinishSetupGuide } from './FinishSetupGuide';
import { SavePackageModal } from './share/SavePackageModal';
import { ShareModal } from './share/ShareModal';
import { OperationProgressModal } from '@/core/ui/components/feedback/OperationProgressModal';
import type { OperationRunnerControls } from '@/core/ui/hooks/useOperationRunner';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { AddDemoModal } from '@/features/project-creation/ui/components/add-demo/AddDemoModal';
import { ProjectsBatchModal } from '@/features/projects-dashboard/ui/components/ProjectsBatchModal';
import type { ProjectsBatchControls } from '@/features/projects-dashboard/ui/hooks/useProjectsBatch';
import type { DemoPackage } from '@/types/demoPackages';
import type { AddedDemo } from '@/types/projectFile';
import type { DashboardInitialData } from '@/types/webviewPayloads';

/** The change-source dialog lists no catalog and no remembered demos: a link is the way in. */
const NO_PACKAGES: DemoPackage[] = [];
const NO_ADDED_DEMOS: AddedDemo[] = [];
const noop = (): void => undefined;

/** The slice of dashboard status the AI capability catalog reads. */
export type AiCapabilityState = Pick<
    UseDashboardStatusReturn,
    | 'aiSkills'
    | 'aiMcps'
    | 'aiSkillsError'
    | 'aiMcpsError'
    | 'aiEditedFiles'
    | 'aiGatedSkills'
    | 'aiInventoryLoading'
    | 'aiBusy'
    | 'aiRegenProgress'
    | 'aiRegenError'
    | 'regenerateAiFiles'
>;

export interface DashboardDialogsProps {
    /** Whether the project has a storefront of its own (Share offers a link for one). */
    isEds: boolean;
    /** The added demo whose source is being changed: present only while that dialog is open. */
    changeSourceDemo?: NonNullable<DashboardInitialData['demo']>;
    onCloseChangeSource: () => void;
    /** Share Demo's and Save as Package's open state. */
    handover: HandoverDialogs;
    /** The long-operation runner whose modal narrates reset, delete, sync and republish. */
    operations: OperationRunnerControls;
    /** Reset's window: the projects list's batch window on this project (step-05 S4). */
    batch: ProjectsBatchControls;
    capabilitiesOpen: boolean;
    onCloseCapabilities: () => void;
    ai: AiCapabilityState;
    /** The Finish Setup guide's controls (PL-101); its dialog shows only while open. */
    finishSetup: FinishSetupControls;
    /** The project's name, for the guide's title. */
    projectName: string;
}

/** After a change of source, status is re-requested so the source check re-runs. */
function onSourceChanged(): void {
    webviewClient.postMessage('requestStatus');
}

/**
 * Renders whichever dashboard dialogs are open.
 *
 * @param props - open state per dialog, and what each dialog shows
 */
export function DashboardDialogs({
    isEds,
    changeSourceDemo,
    onCloseChangeSource,
    handover,
    operations,
    batch,
    capabilitiesOpen,
    onCloseCapabilities,
    ai,
    finishSetup,
    projectName,
}: DashboardDialogsProps) {
    return (
        <>
            {changeSourceDemo ? (
                <AddDemoModal
                    isOpen
                    mode="change"
                    currentKind={changeSourceDemo.storefrontKind}
                    demoPackageName={changeSourceDemo.demoPackageName}
                    packages={NO_PACKAGES}
                    addedDemos={NO_ADDED_DEMOS}
                    onUseShipped={noop}
                    onDemoAdded={onSourceChanged}
                    onClose={onCloseChangeSource}
                />
            ) : null}

            {handover.shareOpen ? (
                <ShareModal isOpen isEds={isEds} onClose={handover.closeShare} />
            ) : null}

            {handover.savePackageOpen ? <SavePackageModal isOpen onClose={handover.closeSavePackage} /> : null}

            <OperationProgressModal
                operation={operations.open}
                onRetry={operations.retry}
                onClose={operations.close}
            />

            {batch.view.phase !== 'closed' && <ProjectsBatchModal controls={batch} />}

            <FinishSetupGuide controls={finishSetup} projectName={projectName} />

            {/* Capability catalog — reached from the "View AI Capabilities" link,
                NOT the health badge. Two sections (skills + MCP servers) plus a
                Regenerate AI files action (which rewrites both). */}
            {capabilitiesOpen && (
                <DialogContainer onDismiss={onCloseCapabilities}>
                    <AiCapabilitiesModal
                        skills={ai.aiSkills}
                        mcps={ai.aiMcps}
                        hasSkillsError={ai.aiSkillsError}
                        hasMcpsError={ai.aiMcpsError}
                        editedFiles={ai.aiEditedFiles}
                        gatedSkills={ai.aiGatedSkills}
                        isLoading={ai.aiInventoryLoading}
                        onClose={onCloseCapabilities}
                        onRegenerate={ai.regenerateAiFiles}
                        isBusy={ai.aiBusy}
                        progress={ai.aiRegenProgress ?? undefined}
                        errorMessage={ai.aiRegenError}
                    />
                </DialogContainer>
            )}
        </>
    );
}
