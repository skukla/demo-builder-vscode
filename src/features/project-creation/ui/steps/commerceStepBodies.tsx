/**
 * CommerceStep body builders (presentational extraction)
 *
 * Pure presentational pieces extracted from {@link CommerceStep} so the step file
 * stays under the size limit: the per-section view-body builder ({@link sectionBody}),
 * the Backend "choice cards" ({@link BackendCard} + {@link ChoiceCheckIcon}), and the
 * copy constants ({@link SECTION_TITLES} / {@link BACKEND_DESCRIPTIONS}; the summary
 * `ROW_LABELS` live in commerceSections). The sub-step nav strip names the active
 * step, so there's no per-step view header. No wizard logic lives here — CommerceStep
 * owns state, the Backend→stack bridge, the gate, and the summary; it imports these.
 *
 * @module features/project-creation/ui/steps/commerceStepBodies
 */

import React from 'react';
import { ChoiceCard } from '../components/ChoiceCard';
import { BACKEND_LABELS, type CommerceSectionId } from './commerceSections';
import { SampleDataStep } from './SampleDataStep';
import { AdobeAuthStep } from '@/features/authentication/ui/steps/AdobeAuthStep';
import type { WizardState } from '@/types/webview';

/**
 * Tradeoff copy for the Backend choice cards (UI labels for the two known backend
 * ids — a constant map, same as {@link BACKEND_LABELS}).
 */
// Kept to ~2 lines in the choice card (~240px) — trimmed copy rather than clamped.
export const BACKEND_DESCRIPTIONS: Record<string, string> = {
    'adobe-commerce-paas': 'Self-managed PaaS. Full control over hosting and extensions.',
    'adobe-commerce-accs': 'Adobe-hosted SaaS. Fast setup; requires Adobe sign-in.',
};

/** No-op setter handed to the contextual AdobeAuthStep (the step owns the gate). */
const NOOP = (): void => {};

/** A single roomy Backend "choice card" (a prominent binary pick, not a dense tile). */
export const BackendCard: React.FC<{
    backend: string;
    pkgName: string;
    available: boolean;
    selected: boolean;
    onSelect: (backend: string) => void;
}> = ({ backend, pkgName, available, selected, onSelect }) => (
    <ChoiceCard
        name={BACKEND_LABELS[backend] ?? backend}
        description={BACKEND_DESCRIPTIONS[backend] ?? ''}
        selected={selected}
        disabled={!available}
        note={available ? undefined : `Not available for ${pkgName}`}
        noteTestId={`backend-note-${backend}`}
        onSelect={() => onSelect(backend)}
        testId={`backend-card-${backend}`}
        checkTestId="backend-card-check"
    />
);

/** Context passed to the per-section body builder. */
export interface SectionBodyContext {
    availableBackends: string[];
    selectedBackend?: string;
    pkgName: string;
    onBackendSelect: (backend: string) => void;
    state: WizardState;
    updateState: (partial: Partial<WizardState>) => void;
    /** The single ConnectStoreStepContent (rendered only by a config step's body). */
    configForm: React.ReactNode;
}

/** Build the body node for a section (backend cards / sign-in / config form). */
export function sectionBody(id: CommerceSectionId, ctx: SectionBodyContext): React.ReactNode {
    if (id === 'backend') {
        return (
            <div className="choice-grid" role="listbox" data-testid="backend-cards">
                {Object.keys(BACKEND_LABELS).map(backend => (
                    <BackendCard
                        key={backend}
                        backend={backend}
                        pkgName={ctx.pkgName}
                        available={ctx.availableBackends.includes(backend)}
                        selected={ctx.selectedBackend === backend}
                        onSelect={ctx.onBackendSelect}
                    />
                ))}
            </div>
        );
    }
    if (id === 'signin') {
        return (
            <AdobeAuthStep state={ctx.state} updateState={ctx.updateState} setCanProceed={NOOP} />
        );
    }
    // Not a config step: it writes a choice onto the project rather than into the
    // .env, and it reads the Data Installer's catalog rather than the connection.
    if (id === 'sample-data') {
        return (
            <SampleDataStep state={ctx.state} updateState={ctx.updateState} setCanProceed={NOOP} />
        );
    }
    // Config steps render ONLY the form — the footer Continue advances to the next
    // sub-step (no in-body "Save & continue" CTA). sectionBody is built only for the
    // active step, so the single configForm instance lives in exactly one place.
    return <>{ctx.configForm}</>;
}
