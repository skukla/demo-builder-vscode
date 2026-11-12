/**
 * J2's window bodies: J1's type table (`TypeSummary.tsx`) for what an install adds and what the SC
 * changed, `ImportRunView` for the run, `LeadText` for a sentence, `CheckboxRow` for the one box.
 * `j2-windows.tsx` puts them in windows; the cards and flyout behind them are `j2-flyout.tsx`.
 */

import { TextField } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { DRY_RUN, UNSAVED, installRows, type DryRunAnswer, type Pack, type PackName } from './scenarioInstall';
import { TypeTable } from './TypeSummary';
import type { ImportStep } from '@/features/data-installer/importSteps';
import { ImportRunView, type RunEnd } from '@/features/data-installer/ui/components/ImportRunView';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

/**
 * Measures the newest window on screen (the panel's pill reads it): J2 swaps one window for a new
 * one (a run for its small result), so it traces the last `.modal-dialog`, again every tick, and the
 * pill starts a fresh measurement for each new box.
 */
export function useTraceLast(label: string): void {
    useEffect(() => {
        const trace = (): void => {
            const boxes = document.querySelectorAll<HTMLElement>('.modal-dialog');
            window.__J1__.trace(boxes[boxes.length - 1] ?? null, label);
        };
        trace();
        const timer = setInterval(trace, FRONTEND_TIMEOUTS.UI_UPDATE_DELAY);
        return () => clearInterval(timer);
    }, [label]);
}

/**
 * What installing a datapack adds: Clear's summary, one row per type, its plain name and its count ("56")
 * (prototype-conventions.md rule 8). No checkboxes: Install installs the whole datapack, since a
 * partial install mixes data (owner, 2026-11-11, J2-1), so nothing is ticked and nothing says why.
 */
export function InstallSummary({ pack }: { pack: Pack }): React.ReactElement {
    return (
        <div className="clear-demo-body">
            <TypeTable rows={installRows(pack)} />
        </div>
    );
}

/**
 * "Save Your Changes First?" before a replace: the standard unsaved-changes sentence (owner, 2026-11-12, J2-3),
 * the changes counted by type, no example names (owner, 2026-11-11, J2-1). No Always box: it is a
 * setting only (owner, 2026-11-12: "It feels like clutter to me.").
 */
export function SaveFirstBody(): React.ReactElement {
    return (
        <div className="clear-demo-body">
            <LeadText>Your changes will be lost if you don't save them.</LeadText>
            <TypeTable rows={UNSAVED} />
        </div>
    );
}

/** One datapack with changes in a batch: the SC's own saves into itself; someone else's into a new one. */
export interface BatchSave {
    pack: string;
    own: boolean;
}

/** A row's Save As cell: a filled-in name field on every row, its problem under it. */
function SaveName({ row, name, error, onName }: { row: BatchSave; name: string; error?: string; onName: (name: string) => void }): React.ReactElement {
    return (
        <div>
            <TextField aria-label={`New datapack name for ${row.pack}'s changes`} value={name} onChange={onName} width="100%" validationState={error ? 'invalid' : undefined} />
            {/* Room kept for the problem line, so the window never grows (rule 14). */}
            <p className="dialog-problem text-negative">{error ?? '\u00a0'}</p>
        </div>
    );
}

/**
 * J7's "Save Your Changes First?" body: the same sentence and box as one datapack's, with one row per
 * datapack saying where its changes go (owner, 2026-11-12: the J2 and J5 save question, in place of
 * the batch's Datapack Changes step). Every row has a Save As field, filled in: the SC's own
 * datapack starts with its own name (saved into it; another name saves a new one), someone else's with
 * "My <Pack>" (owner, 2026-11-12: "What if I wanted to edit the Luma name?").
 */
export function BatchSaveBody({ rows, names, errors, onName }: {
    rows: BatchSave[];
    names: Record<string, string>;
    errors: Record<string, string | undefined>;
    onName: (pack: string, name: string) => void;
}): React.ReactElement {
    return (
        <div className="clear-demo-body">
            <LeadText>Your changes will be lost if you don't save them.</LeadText>
            <div className="type-table type-table-headed" role="table" aria-label="Where each datapack's changes go">
                <div className="type-row type-head-row" role="row">
                    <div className="batch-changes-head" role="columnheader">Datapack</div>
                    <div className="batch-changes-head" role="columnheader">Save As</div>
                </div>
                {rows.map((row) => (
                    <div className="type-row" role="row" key={row.pack}>
                        <div className="type-name" role="rowheader">{row.pack}</div>
                        <div className="type-cell" role="cell">
                            <SaveName row={row} name={names[row.pack] ?? ''} error={errors[row.pack]} onName={(name) => onName(row.pack, name)} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** A Dry Run's answer: one sentence naming the datapack and saying nothing was written (D6). */
export function DryRunBody({ answer, pack }: { answer: DryRunAnswer; pack: PackName }): React.ReactElement {
    return <LeadText sentences>{DRY_RUN[answer].lead(pack)}</LeadText>;
}

/** The run's steps: the clock under them while it runs, "Took …" once it ends with a problem. */
export function RunBody({ steps, startedAt, end }: { steps: ImportStep[]; startedAt: number; end?: RunEnd }): React.ReactElement {
    return <ImportRunView steps={steps} columns={2} {...(end ? { end } : { running: { startedAt } })} />;
}

/** A notification's words and its one button, if it has one (J5-3's success has none). */
export interface NotificationStandInProps {
    message: string;
    button?: { label: string; onPress: () => void };
}

/**
 * PROTOTYPE STAND-IN for a VS Code notification. In the extension it is VS Code's own notification,
 * not part of the window; drawn here in the prototype's style so it never reads as the product.
 * J2's one-time tip and J5's background job results both use it.
 */
export function NotificationStandIn({ message, button }: NotificationStandInProps): React.ReactElement {
    return createPortal(
        <div className="vscode-standin" data-react-aria-top-layer="true" role="status">
            <div className="vscode-standin-tag">VS Code notification (stand-in)</div>
            <div>{message}</div>
            {button ? (
                <div className="vscode-standin-actions">
                    <button type="button" onClick={button.onPress}>{button.label}</button>
                </div>
            ) : null}
        </div>,
        document.body,
    );
}


/** The window event the save question sends once answered; `SaveTipHost` shows the tip the first time. */
const SAVE_TIP_EVENT = 'proto-save-tip';
let saveTipSent = false;

/** A save question was answered: the first time this page has seen one, the tip shows. */
export function announceSaveTip(): void {
    if (saveTipSent) return;
    saveTipSent = true;
    window.dispatchEvent(new Event(SAVE_TIP_EVENT));
}

/**
 * The one-time tip after the first save question, as delete's after its first run
 * (`projectDeletionService.ts` `showOneTimeTip`): a VS Code notification, drawn here as a stand-in,
 * pointing to the setting that replaced the window's box (owner, 2026-11-12). Mounted once by the
 * screen, so it outlives the window that sent it.
 */
export function SaveTipHost(): React.ReactElement | null {
    const [shown, setShown] = useState(false);
    useEffect(() => {
        const show = (): void => setShown(true);
        window.addEventListener(SAVE_TIP_EVENT, show);
        return () => window.removeEventListener(SAVE_TIP_EVENT, show);
    }, []);
    if (!shown) return null;
    return <NotificationStandIn message="Tip: You can customize saving changes in Settings → Demo Builder" button={{ label: 'Open Settings', onPress: () => setShown(false) }} />;
}
