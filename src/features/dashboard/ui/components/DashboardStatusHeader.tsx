/**
 * DashboardStatusHeader Component
 *
 * The full-width status band at the top of the project dashboard: the project's
 * ENVIRONMENT health badges (AI · IMS Org) on the left, the "All Projects"
 * navigation on the right, and the "View AI Capabilities" link below the
 * badges. Each badge surfaces its remediation through the shared
 * StatusCard.action (regenerate AI files, sign in to check).
 *
 * The band holds environment health ONLY — whether the tooling works at all.
 * The placement rule, and why it exists, is documented once in ActionGrid.
 * The artifact's own state lives in the ActionGrid zone that owns it: the
 * frontend's in Primary/Storefront, the mesh's and integrations' on the
 * integrations grid (ADR-011 D3 Step 08 moved the mesh; the frontend followed
 * for the same reason).
 *
 * The Frontend badge was the counter-example that produced the rule. It reported
 * "Republish needed" and "Restart needed" while its fixes lived down in the
 * ActionGrid — the republish buried in the More overflow, the restart nowhere at
 * all — so it was the only badge naming a problem and offering nothing. It also
 * carried two unrelated axes at once: EDS storefront publish state and the
 * non-EDS local dev server.
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
                                {/* STACKED, so the values line up — "READY" and the org
                                    name start at the same x, which is what lets two
                                    facts read as a pair. This comment used to claim a
                                    single horizontal row; it predated the 2026-07-09
                                    column and briefly got the CSS flattened to match.
                                    Height comes out of the band's PADDING, not its rows.
                                    Pinned by a test that reads the CSS, since jsdom
                                    resolves no layout and cannot tell the difference. */}
                                <div className="dashboard-status-badges">
                                    {/* AI Ready Status, with BOTH its affordances on the
                                        same line: "Regenerate AI files" (the fix,
                                        only when red/yellow) via StatusCard.action,
                                        and the always-on "View AI Capabilities"
                                        navigation beside it.

                                        The capabilities link used to sit in a row of
                                        its own below the badges, on the grounds that
                                        navigation is not a remediation. That is true
                                        and it still is not one — but it cost the band
                                        a whole row to say one thing, about the badge
                                        directly above it. */}
                                    <div
                                        className="dashboard-status-badge-inline"
                                        data-testid="ai-status-row"
                                    >
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
                                        <Link
                                            data-testid="ai-view-capabilities-trigger"
                                            onPress={onViewCapabilities}
                                            isQuiet
                                            UNSAFE_className="text-sm cursor-pointer"
                                        >
                                            View AI Capabilities
                                        </Link>
                                    </div>

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
