/**
 * J6's part of the screen: a project whose datapack install failed when the project was created.
 * The failure is shown exactly as integration cards show a failed deploy (overview.md Phase 5): on
 * the card, the shared `IntegrationStatusLabel` (the error dot and "Install failed"), no border
 * change and no check; in the flyout, the same label under the title with the reason under it, as
 * the integration flyout's health line; the flyout's one action is Retry, then Fix with AI. The
 * project dashboard's Datapacks card shows the failure as the dashboard's linked integrations do:
 * the error dot, whose hover says "Install failed", beside the bare name (owner, 2026-11-12: no
 * reason in brackets).
 *
 * The demo's datapack is My Luma throughout; the panel's "Retry ends (J6)" select says how a retry
 * ends.
 */

import { Button } from '@adobe/react-spectrum';
import Box from '@spectrum-icons/workflow/Box';
import React, { useState } from 'react';
import { DatapackCards, DatapackFlyout } from './j2-flyout';
import { setSelect } from './j2-screen';
import { fixWithAi } from './j2-windows';
import { RetryWindow } from './j6-windows';
import type { TourStop } from './j1Tour';
import type { StepWindow } from './reviewSteps';
import { DEMO_PACK, STOP_REASON, type PackName } from './scenarioInstall';
import { INSTALL_FAILED, RETRIES, canRetry } from './scenarioFailed';
import { IntegrationStatusLabel } from '@/core/ui/components/integrations/IntegrationStatusLabel';
import { DashboardTile } from '@/features/dashboard/ui/components/DashboardTile';
import { DashboardZone } from '@/features/dashboard/ui/components/DashboardZone';
import '@/core/ui/styles/integration-cards.css';
import '@/features/dashboard/ui/styles/dashboard.css';

/** J6's windows, as review steps name them. */
export type J6StepWindow = Extract<StepWindow, `failed-${string}`>;

/** Which screen shows: the project's Datapacks, or the project dashboard. */
export type J6View = 'datapacks' | 'dashboard';

/** Each J6 step: the screen, whether the flyout is open, retries already tried, and a stopped run on screen. */
const STEP_SETUP: Record<J6StepWindow, { view: J6View; flyout?: true; retries: number; stopped?: true }> = {
    'failed-card': { view: 'datapacks', retries: 0 },
    'failed-flyout': { view: 'datapacks', flyout: true, retries: 0 },
    'failed-fix': { view: 'datapacks', retries: RETRIES, stopped: true },
    'failed-dashboard': { view: 'dashboard', retries: 0 },
};

export const isJ6Window = (w: StepWindow): w is J6StepWindow => w in STEP_SETUP;

/** The project the dashboard belongs to (overview.md Phase 6's example name). */
const PROJECT = 'Kukla Luma';

/** The status the card and the flyout share: the integration card's own label. */
const FailedLabel = (): React.ReactElement => <IntegrationStatusLabel model={{ dotVariant: 'error', status: 'error', statusLabel: INSTALL_FAILED }} />;

/** The flyout's health line: the label, and the reason under it (the integration flyout's `HealthLine`). */
function HealthLine(): React.ReactElement {
    return (
        <div className="integration-panel-health">
            <span className="integration-statusline">
                <FailedLabel />
            </span>
            <span className="integration-panel-status-message">{STOP_REASON}</span>
        </div>
    );
}

/** The failed flyout's bar: its one action, Retry or Fix with AI, and More, built in J8. */
function FailedActions({ retries, onRetry }: { retries: number; onRetry: () => void }): React.ReactElement {
    const fix = fixWithAi();
    return (
        <>
            <div className="proto-note">Prototype: More is built in J8.</div>
            <div className="db-drawer-actions">
                {canRetry(retries) ? (
                    <Button variant="accent" onPress={onRetry}>Retry</Button>
                ) : (
                    <Button variant="accent" onPress={fix.onPress}>{fix.label}</Button>
                )}
                <Button variant="secondary" isDisabled>More ▾</Button>
            </div>
        </>
    );
}

/** The project dashboard's Open row, the Datapacks card alone: the line names the pack, the dot is the failure. */
function Dashboard({ failed, onOpen }: { failed: boolean; onOpen: () => void }): React.ReactElement {
    return (
        <>
            <h1>{PROJECT}</h1>
            <div className="j6-dashboard">
                <DashboardZone id="open" title="Open">
                    <DashboardTile
                        label="Datapacks"
                        description={DEMO_PACK}
                        icon={<Box size="L" />}
                        onPress={onOpen}
                        action="dataInstaller"
                        tooltip="Install, save or change this demo's datapack"
                        {...(failed ? { status: { variant: 'error' as const, tooltip: INSTALL_FAILED, testId: 'datapacks-failed' } } : {})}
                    />
                </DashboardZone>
            </div>
        </>
    );
}

export interface J6Screen {
    openStep: (w: J6StepWindow) => void;
    reset: () => void;
    onTourStop: (stop: TourStop) => void;
    /** The dashboard takes the whole screen: the Datapacks heading and header are not drawn. */
    dashboard: boolean;
    cards: React.ReactNode;
    window: React.ReactNode;
}

/** J6's screen state. `run` redraws the open window when a panel select changes. */
export function useJ6Screen(run: number): J6Screen {
    const [view, setView] = useState<J6View>('datapacks');
    const [failed, setFailed] = useState(true);
    const [retries, setRetries] = useState(0);
    const [flyout, setFlyout] = useState<PackName | null>(null);
    const [retrying, setRetrying] = useState<'new' | 'stopped' | null>(null);
    const [opened, setOpened] = useState(0);
    const retry = (from: 'new' | 'stopped'): void => {
        setFlyout(null);
        setOpened((n) => n + 1);
        setRetrying(from);
    };
    const reset = (): void => {
        setView('datapacks');
        setFailed(true);
        setRetries(0);
        setFlyout(null);
        setRetrying(null);
    };
    const datapacks = (
        <>
            <DatapackCards demo={failed ? 'none' : DEMO_PACK} onOpen={setFlyout} {...(failed ? { statuses: { [DEMO_PACK]: <FailedLabel /> } } : {})} />
            <DatapackFlyout pack={flyout} demo={DEMO_PACK} onClose={() => setFlyout(null)}
                {...(failed && flyout === DEMO_PACK ? { status: <HealthLine />, actions: <FailedActions retries={retries} onRetry={() => retry('new')} /> } : {})} />
        </>
    );
    return {
        openStep: (w) => {
            reset();
            const setup = STEP_SETUP[w];
            setView(setup.view);
            setRetries(setup.retries);
            if (setup.flyout) setFlyout(DEMO_PACK);
            if (setup.stopped) retry('stopped');
        },
        reset,
        onTourStop: (stop) => {
            if (stop.retryEnds) setSelect('j6-retry', stop.retryEnds);
            if (stop.j6View) setView(stop.j6View);
        },
        dashboard: view === 'dashboard',
        cards: view === 'dashboard' ? <Dashboard failed={failed} onOpen={() => setView('datapacks')} /> : datapacks,
        window: retrying ? (
            <RetryWindow key={`${opened}-${run}`} retries={retries} startEnded={retrying === 'stopped'}
                onStopped={() => setRetries((n) => n + 1)} onInstalled={() => setFailed(false)} onClose={() => setRetrying(null)} />
        ) : null,
    };
}

