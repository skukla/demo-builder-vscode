/**
 * progressRegister — the ONE rule for how a long operation narrates itself.
 *
 * Two surfaces report a deploy: a VS Code progress notification and the card for
 * the thing being acted on. They carry different registers, and the split is:
 *
 *   - NOTIFICATION — a static title naming the operation and its object
 *     ("Deploying API Mesh"), plus each STEP as it happens.
 *   - CARD — the operation named once ("Deploying Mesh"), then held still.
 *
 * Two rules fall out, and both are enforced here rather than remembered:
 * **no two surfaces narrate the same step**, and the card's line is the verb plus
 * the KIND — never the component name, which its own heading already carries.
 *
 * WHY THIS IS SHARED. It was implemented twice — `withComponentProgress` for App
 * Builder components and `deployMeshWithFeedback` for the mesh — and on
 * 2026-08-04 the split was reversed (steps had been on the card, where a two-part
 * step wrapped across two shouting lines inside a ~450px tile). Only one copy was
 * updated. The other kept narrating the old way for another round of testing,
 * because each site reads as correct in isolation: what was duplicated is a
 * DECISION, not a block of code, so no duplication scanner would flag it and no
 * reviewer diffing the files would see it either.
 *
 * The seam is deliberately narrow. The two callers push to genuinely different
 * card channels (a keyed row vs the mesh status channel) and own genuinely
 * different extras (logger lines and guard handling; a second `onStatus` channel
 * and result capture). Those stay with them. This owns only the notification
 * shell and the two rules above — the parts that must not diverge again.
 *
 * @module core/vscode/progressRegister
 */

import * as vscode from 'vscode';

/**
 * Build the card's in-flight line: verb + kind.
 *
 * Use this rather than composing the string, so both surfaces read the same way
 * and a change to the convention lands in one place.
 *
 * @param verb - the operation ("Adding", "Deploying", "Removing")
 * @param noun - the component KIND ("Mesh", "Integration")
 * @returns e.g. "Deploying Mesh"
 */
export function cardInFlightLabel(verb: string, noun: string): string {
    return `${verb} ${noun}`;
}

export interface ProgressRegisterOptions {
    /** Notification title: the operation and its object ("Deploying API Mesh"). */
    title: string;
    /**
     * The card's single in-flight line — build it with {@link cardInFlightLabel}.
     *
     * OPTIONAL: project-scoped operations have no card. Changing the Adobe deploy
     * destination was passing `''` with a no-op push purely to satisfy the type,
     * and the update notifications reach past this helper to raw
     * `vscode.window.withProgress` for the same reason. The register's value is
     * the step→notification half; the card half belongs to surfaces that have one.
     */
    cardLabel?: string;
    /**
     * Push the card's in-flight line on whichever channel this surface owns.
     *
     * A callback because the two channels are unrelated APIs: a keyed per-row
     * status update, and the mesh status channel. Only the timing and the text
     * are shared, which is precisely what this module exists to fix.
     */
    pushCardStatus?: (label: string) => void;
}

/**
 * Run a long operation inside the progress notification, with the register split
 * applied.
 *
 * The card is told once, before the work starts, so a slow first step is not
 * silent. Every step the work reports goes to the notification.
 *
 * @param options - notification title, the card's line, the card's channel
 * @param run - the work; call its `report` per step (steps reach the NOTIFICATION)
 * @returns whatever `run` resolves to, captured from inside the task so the
 *          caller gets it regardless of what the notification does
 */
export async function withProgressRegister<T>(
    options: ProgressRegisterOptions,
    run: (report: (message: string) => void) => Promise<T>,
): Promise<T> {
    const { title, cardLabel, pushCardStatus } = options;

    // Captured from the task rather than taken from withProgress's return value,
    // so a caller still gets a result whatever the notification does.
    let result!: T;

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title,
            cancellable: false,
        },
        async (progress) => {
            if (pushCardStatus) pushCardStatus(cardLabel ?? '');
            result = await run((message) => {
                progress.report({ message });
            });
        },
    );

    return result;
}
