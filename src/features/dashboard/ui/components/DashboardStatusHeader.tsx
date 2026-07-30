/**
 * DashboardStatusHeader Component
 *
 * The full-width status band at the top of the project dashboard: the project's
 * health badges (Frontend · AI · IMS Org) on the left, the "All Projects"
 * navigation on the right, and the "View AI Capabilities" link below the
 * badges. Each badge can surface a remediation action via the shared
 * StatusCard.action (re-auth, regenerate AI files). The mesh's status is NOT a
 * masthead badge anymore — since ADR-011 D3 Step 08 it renders as the mesh peer
 * card of the integrations grid (IntegrationsGrid), which carries the same
 * status vocabulary plus the deploy/sign-in remediations.
 *
 * Extracted from ProjectDashboardScreen: the status block was ~100 lines nested
 * eight levels deep, which both pushed the screen past its complexity budget and
 * obscured the dashboard's top-level structure (masthead → action column →
 * detail panel). As a cohesive, purely-presentational unit it belongs in its own
 * component — same rationale as ActionGrid / IntegrationsBlock / OrgContextNotice.
 *
 * @module features/dashboard/ui/components/DashboardStatusHeader
 */

import { View, Flex, Button, Link } from '@adobe/react-spectrum';
import React from 'react';
import type {
    StatusDisplay,
    AiReadyState,
    OrgCheckState,
} from '../hooks/useDashboardStatus';
import { StatusCard } from '@/core/ui/components/feedback';

export interface DashboardStatusHeaderProps {
    /** Frontend/demo status badge. */
    demoStatusDisplay: StatusDisplay;
    /** AI Ready badge state. */
    aiReady: AiReadyState;
    /** "IMS Org" badge (null when N/A — non-Adobe project). */
    imsOrgDisplay: StatusDisplay | null;
    /** Org-context check lifecycle — drives the `unknown` "Sign in to check". */
    orgCheckState: OrgCheckState;
    /** User-initiated re-auth (mesh `needs-auth` / org `unknown`). */
    onReAuthenticate: () => void;
    /** Regenerate AI files (AI badge red/yellow remediation). */
    onRegenerateAi: () => void;
    /** Open the AI capability catalog. */
    onViewCapabilities: () => void;
    /** Navigate back to the projects list. */
    onNavigateBack: () => void;
}

/**
 * Renders the dashboard's full-width status masthead row.
 *
 * @param props - Component props
 */
export function DashboardStatusHeader({
    demoStatusDisplay,
    aiReady,
    imsOrgDisplay,
    orgCheckState,
    onReAuthenticate,
    onRegenerateAi,
    onViewCapabilities,
    onNavigateBack,
}: DashboardStatusHeaderProps): React.ReactElement {
    return (
        <div className="dashboard-status-header">
            <div className="page-container-padded page-header-section">
                {/* Content wrapper matches grid width for alignment */}
                <div className="dashboard-status-content">
                    <Flex alignItems="center" gap="size-300">
                        {/* Status indicators */}
                        <View flex>
                            <div className="dashboard-status-grid">
                                {/* Status badges laid out in a single horizontal row
                                    (wrapping only if the band runs out of width) so they
                                    use the masthead's width instead of stacking. */}
                                <div className="dashboard-status-badges">
                                    {/* Demo Status */}
                                    <StatusCard
                                        label="Frontend"
                                        status={demoStatusDisplay.text}
                                        color={demoStatusDisplay.color}
                                        size="S"
                                        className="dashboard-status-badge"
                                    />

                                    {/* AI Ready Status — a failing/incomplete badge
                                        (red/yellow) surfaces the "Regenerate AI files"
                                        fix through the shared StatusCard.action. The
                                        always-on "View AI Capabilities" navigation stays
                                        a separate link below (it's not a remediation). */}
                                    <StatusCard
                                        label={aiReady.label}
                                        status={aiReady.text}
                                        color={aiReady.color}
                                        size="S"
                                        className="dashboard-status-badge"
                                        action={(aiReady.color === 'red' || aiReady.color === 'yellow')
                                            ? {
                                                label: 'Regenerate AI files',
                                                onPress: onRegenerateAi,
                                                testId: 'ai-regenerate-trigger',
                                            }
                                            : undefined}
                                    />

                                    {/* IMS Org status — ambient org-context health (blue checking →
                                        green org name / red wrong org). Shown only for Adobe projects.
                                        The `unknown` case (couldn't check non-interactively on open)
                                        surfaces a quiet "Sign in to check" via StatusCard.action — a
                                        user-initiated sign-in (allowed to open a browser). The
                                        actionable mismatch banner is separate (below). */}
                                    {imsOrgDisplay && (
                                        <StatusCard
                                            label="IMS Org"
                                            status={imsOrgDisplay.text}
                                            color={imsOrgDisplay.color}
                                            size="S"
                                            className="dashboard-status-badge"
                                            action={orgCheckState === 'unknown'
                                                ? { label: 'Sign in to check', onPress: onReAuthenticate }
                                                : undefined}
                                        />
                                    )}
                                </div>

                                {/* AI capability discovery — always-on navigation to
                                    the capability catalog (NOT a status remediation, so
                                    it stays a standalone link, not a StatusCard.action).
                                    Sits below the badge row. */}
                                <Flex
                                    direction="row"
                                    gap="size-200"
                                    alignItems="center"
                                >
                                    <Link
                                        data-testid="ai-view-capabilities-trigger"
                                        onPress={onViewCapabilities}
                                        isQuiet
                                        UNSAFE_className="text-sm cursor-pointer"
                                    >
                                        View AI Capabilities
                                    </Link>
                                </Flex>
                            </div>
                        </View>
                        {/* All Projects button */}
                        <Button variant="secondary" onPress={onNavigateBack}>
                            All Projects
                        </Button>
                    </Flex>
                </div>
            </div>
        </div>
    );
}
