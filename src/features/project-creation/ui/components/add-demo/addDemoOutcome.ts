/**
 * addDemoOutcome — when the "Add a demo package" dialog has an answer rather than a form: a
 * refusal, a failure, or a choice. The answer is the dialog's title with its status icon, and the
 * body says only what is left to know or do (`docs/development/sop/dialog-design.md`). Pure, so
 * each answer's words and colour can be read without a host.
 *
 * Red for what failed or cannot be built on. Amber for what needs the SC: a sign-in, a name the
 * account already uses (a choice, not a failure: owner, 2026-09-15), a demo we ship.
 *
 * @module features/project-creation/ui/components/add-demo/addDemoOutcome
 */

import {
    COPY,
    kindMatches,
    wrongKindMessage,
    type AddDemoMode,
    type AddDemoStage,
} from './addDemoFlow';
import type { ProbeState } from './useAddDemoFlow';
import type { ModalStatus } from '@/core/ui/components/ui/Modal';
import type { DemoPackage } from '@/types/demoPackages';
import type { StorefrontKind } from '@/types/projectFile';
import type { SharedDemoProbeResult, SharedDemoRead } from '@/types/webviewRequests';

export interface AddDemoOutcome {
    title: string;
    status: ModalStatus;
    /** The body: one line of text each. */
    lines: string[];
    testId: string;
}

export interface AddDemoOutcomeInput {
    stage: AddDemoStage;
    probe: ProbeState;
    addError?: string;
    zipError?: string;
    zipConflict: boolean;
    mode: AddDemoMode;
    currentKind?: StorefrontKind;
    packages: DemoPackage[];
}

/** What is missing, from what the probe found, in a sentence. */
function refusalDetails(read: SharedDemoRead): string[] {
    if (read.missing && read.missing.length > 0) {
        return [`It is missing ${read.missing.join(', ')}.`, ...read.warnings];
    }
    return read.warnings;
}

function zipOutcome(error: string, conflict: boolean): AddDemoOutcome {
    return {
        title: conflict ? COPY.zipNameTaken : COPY.zipFailed,
        status: conflict ? 'warning' : 'error',
        lines: [error],
        testId: 'zip-error',
    };
}

/** A read that did not finish says nothing about the demo. A missing sign-in says what to do. */
function probeFailedOutcome(probe: Extract<ProbeState, { status: 'failed' }>): AddDemoOutcome {
    return probe.needsAuth
        ? { title: COPY.signInFirst, status: 'warning', lines: [COPY.signInHow], testId: 'probe-refused' }
        : { title: COPY.readFailed, status: 'error', lines: [probe.error], testId: 'probe-refused' };
}

function shippedOutcome(shippedPackageId: string, input: AddDemoOutcomeInput): AddDemoOutcome {
    const name = input.packages.find((pkg) => pkg.id === shippedPackageId)?.name;
    const useCard = `Use ${name ? `the ${name} card` : 'its card'} instead; it comes with everything we keep up to date for it.`;
    return {
        title: name ? `This is the demo behind ${name}` : COPY.shippedUnnamed,
        status: 'warning',
        lines: [input.mode === 'change' ? COPY.change.shipped : useCard],
        testId: 'shipped-notice',
    };
}

function resultOutcome(result: SharedDemoProbeResult, input: AddDemoOutcomeInput): AddDemoOutcome | undefined {
    if (result.outcome === 'unreadable') {
        return { title: COPY.readFailed, status: 'error', lines: [result.reason], testId: 'probe-refused' };
    }
    if (result.outcome === 'shipped') return shippedOutcome(result.shippedPackageId, input);
    if (result.kind === 'not-a-storefront') {
        return {
            title: COPY.notADemo,
            status: 'error',
            lines: [COPY.notADemoWhy, ...refusalDetails(result)],
            testId: 'probe-refused',
        };
    }
    if (input.mode === 'change' && input.currentKind && !kindMatches(result, input.currentKind)) {
        return {
            title: COPY.change.wrongKindTitle,
            status: 'error',
            lines: [wrongKindMessage(input.currentKind)],
            testId: 'probe-refused',
        };
    }
    return undefined;
}

/**
 * The answer the dialog is showing, if it is showing one.
 *
 * @param input - where the flow stands
 * @returns the title, its status and the body's lines, or undefined while there is a form to show
 */
export function outcomeOf(input: AddDemoOutcomeInput): AddDemoOutcome | undefined {
    if (input.zipError) return zipOutcome(input.zipError, input.zipConflict);
    if (input.stage !== 'found') return undefined;
    if (input.probe.status === 'failed') return probeFailedOutcome(input.probe);
    if (input.probe.status !== 'done') return undefined;
    if (input.addError) {
        const title = input.mode === 'change' ? COPY.change.changeFailed : COPY.addFailed;
        return { title, status: 'error', lines: [input.addError], testId: 'add-error' };
    }
    return resultOutcome(input.probe.result, input);
}
