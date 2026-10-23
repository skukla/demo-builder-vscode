/**
 * DashboardDialogs — everything the project dashboard can open ON TOP of
 * itself: Change source, Share Demo, the storefront report, the long-operation
 * progress modal, and the AI capability catalog.
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
import type { HandoverDialogs } from '../hooks/useHandoverDialogs';
import type { StorefrontReportDialog } from '../hooks/useStorefrontReport';
import { AiCapabilitiesModal } from './AiCapabilitiesModal';
import { ShareModal } from './share/ShareModal';
import { StorefrontReportModal } from './StorefrontReportModal';
import { OperationProgressModal } from '@/core/ui/components/feedback/OperationProgressModal';
import type { OperationRunnerControls } from '@/core/ui/hooks/useOperationRunner';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { AddDemoModal } from '@/features/project-creation/ui/components/add-demo/AddDemoModal';
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
    /** The Share dialog's open state. */
    handover: HandoverDialogs;
    /** The storefront report's window: its open state (EDS-64). */
    storefrontReport: StorefrontReportDialog;
    /** The project as the SC named it, for the report's title. */
    projectName: string;
    /** The dashboard's Reset, which the report's "Needs reset" offers. */
    onResetProject: () => void;
    /** The long-operation runner whose modal narrates reset, delete, sync and republish. */
    operations: OperationRunnerControls;
    capabilitiesOpen: boolean;
    onCloseCapabilities: () => void;
    ai: AiCapabilityState;
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
    storefrontReport,
    projectName,
    onResetProject,
    operations,
    capabilitiesOpen,
    onCloseCapabilities,
    ai,
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

            {storefrontReport.isOpen ? (
                <DialogContainer onDismiss={storefrontReport.close}>
                    <StorefrontReportModal
                        projectName={projectName}
                        onClose={storefrontReport.close}
                        onReset={onResetProject}
                    />
                </DialogContainer>
            ) : null}

            <OperationProgressModal
                operation={operations.open}
                onRetry={operations.retry}
                onClose={operations.close}
            />

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
