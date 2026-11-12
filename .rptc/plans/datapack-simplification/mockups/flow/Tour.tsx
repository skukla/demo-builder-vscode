/**
 * The guided tour engine: highlights where the current stop points, puts a callout beside it saying
 * what to do and what was decided, and moves to the next stop when the owner presses the stop's
 * target in the product. It waits, callout hidden, while the next target is not on screen yet (a
 * window reading its data). Marked as a top layer so an open Spectrum dialog does not make it inert.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BuiltStep, ReviewJourney } from './reviewSteps';
import type { TourStop, TourTarget } from './j1Tour';

const POLL_MS = 150;
const CALLOUT_WIDTH = 340;
const GAP = 14;

/**
 * On screen and seen: laid out, and not in a window still measuring itself or in the hidden copies
 * of the steps it reserves (`StepsWindow`), which are laid out but invisible.
 */
const visible = (el: HTMLElement): boolean => el.getClientRects().length > 0 && !el.closest('.is-measuring, .modal-steps-ghost');

/** The first visible element matching `selector` whose text is `text` (or starts with it). */
function byText(selector: string, text: string, prefix = false): HTMLElement | null {
    const all = [...document.querySelectorAll<HTMLElement>(selector)];
    return all.find((el) => {
        const t = el.textContent?.trim() ?? '';
        return (prefix ? t.startsWith(text) : t === text) && visible(el);
    }) ?? null;
}

const inDialog = (selector: string): HTMLElement | null =>
    [...document.querySelectorAll<HTMLElement>(`[role=dialog] ${selector}`)].find(visible) ?? null;
/** A window's title ending with `text`, in a window that shows no run (a small result). */
const resultTitle = (text: string): HTMLElement | null =>
    [...document.querySelectorAll<HTMLElement>('.modal-title')].find(
        (el) => visible(el) && (el.textContent ?? '').trim().endsWith(text) && !el.closest('[role=dialog]')?.querySelector('.import-steps'),
    ) ?? null;
/** The open window whose title matches `title`, whole. */
const batchWindow = (title: RegExp): HTMLElement | null =>
    [...document.querySelectorAll<HTMLElement>('.modal-title')].find((el) => visible(el) && title.test((el.textContent ?? '').trim()))?.closest<HTMLElement>('.modal-dialog') ?? null;
const card = (pack: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-datapack="${pack}"]`);
const railButton = (type: string): HTMLElement | null => byText('.datapack-picks-kind', type, true);
const dialogButton = (text: string, prefix = false): HTMLElement | null => byText('[role=dialog] [role=button], [role=dialog] button', text, prefix);

/** Each target as an element on screen now, or null. */
const FIND: Record<TourTarget, () => HTMLElement | null> = {
    'clear-menu': () => byText('.j1-screen button', 'Clear'),
    'menu-clear-demo-data': () => byText('[role=menuitem]', 'Clear Demo Data'),
    'menu-clear-instance': () => byText('[role=menuitem]', 'Clear Commerce Instance'),
    'summary-table': () => inDialog('.type-table'),
    'review-records': () => dialogButton('Review Records'),
    'type-rail': () => inDialog('.datapack-picks-rail'),
    'rail-categories': () => railButton('Categories'),
    'rail-customers': () => railButton('Customers'),
    'rail-orders': () => railButton('Orders'),
    tree: () => inDialog('.tree-list'),
    'kept-tab': () => byText('[role=dialog] .view-switcher-button', 'Kept', true),
    'first-tab': () => inDialog('.view-switcher-button'),
    'record-rows': () => inDialog('.datapack-pick-rows'),
    back: () => dialogButton('Back'),
    'clear-items': () => dialogButton('Clear ', true),
    'problem-row': () => {
        const title = document.querySelector('[role=dialog] h2')?.textContent ?? '';
        return title.endsWith('Cleared') ? byText('[role=dialog] li', 'Website Settings', true) : null;
    },
    close: () => dialogButton('Close'),
    'website-list': () => inDialog('.clear-demo-body'),
    'select-all': () => document.querySelector<HTMLElement>('[role=dialog] .select-all-row label'),
    next: () => dialogButton('Next'),
    warning: () => inDialog('.inline-notice'),
    understand: () => byText('[role=dialog] label', 'I understand', true),
    'clear-websites': () => dialogButton('Clear 3 Websites'),
    'my-luma-card': () => card('My Luma'),
    'bodea-card': () => card('Bodea'),
    flyout: () => [...document.querySelectorAll<HTMLElement>('.db-drawer.open .db-drawer-actions')].find(visible) ?? null,
    'flyout-install': () => byText('.db-drawer.open button', 'Install') ?? byText('.db-drawer.open button', 'Switch to', true),
    'flyout-close': () => document.querySelector<HTMLElement>('.db-drawer.open [aria-label="Close details"]'),
    'installed-result': () => resultTitle(' Installed'),
    'dry-run': () => dialogButton('Dry Run'),
    // The whole small window, so the callout sits beside it rather than over its buttons.
    'dry-result': () =>
        (resultTitle('Dry Run Passed') ?? resultTitle('Dry Run Found a Problem') ?? resultTitle('Dry Run Failed'))?.closest<HTMLElement>('.modal-dialog') ?? null,
    install: () => dialogButton('Install'),
    'save-and-replace': () => dialogButton('Save and Switch'),
    'run-steps': () => inDialog('.import-steps'),
    replace: () => dialogButton('Switch'),
    'save-menu': () => byText('.j1-screen button', 'Save'),
    'menu-save': () => byText('[role=menuitem]', 'Save'),
    'menu-save-as-new': () => byText('[role=menuitem]', 'Save As New'),
    'save-as-new': () => byText('.j1-screen button', 'Save As New'),
    'create-datapack': () => byText('.j1-screen button', 'Create'),
    save: () => dialogButton('Save'),
    create: () => dialogButton('Create'),
    'name-field': () => inDialog('input'),
    picker: () => inDialog('.datapack-picks'),
    'select-all-data': () => byText('[role=dialog] label', 'Select All Data', true),
    'flyout-more': () => document.querySelector<HTMLElement>('.db-drawer.open [aria-label^="More actions"]'),
    'menu-undo': () => byText('[role=menuitem]', 'Undo Last Save'),
    'undo-question': () => resultTitle('Undo Last Save?')?.closest<HTMLElement>('.modal-dialog') ?? null,
    undo: () => dialogButton('Undo'),
    cancel: () => dialogButton('Cancel'),
    'amber-dot': () => document.querySelector<HTMLElement>('.j1-screen .datapack-card-newer'),
    'flyout-restore': () => byText('.db-drawer.open button', 'Restore ', true),
    'restore-question': () => resultTitle('Restore My Luma?')?.closest<HTMLElement>('.modal-dialog') ?? null,
    restore: () => dialogButton('Restore'),
    // J4's small results: … Restored, … Is Up to Date.
    'restore-result': () =>
        [...document.querySelectorAll<HTMLElement>('.modal-title')].find(
            (el) => visible(el) && /(Restored|Is Up to Date)$/u.test((el.textContent ?? '').trim()) && !el.closest('[role=dialog]')?.querySelector('.import-steps'),
        ) ?? null,
    'menu-uninstall': () => byText('[role=menuitem]', 'Uninstall'),
    'uninstall-question': () => resultTitle('Uninstall My Luma?')?.closest<HTMLElement>('.modal-dialog') ?? null,
    uninstall: () => dialogButton('Uninstall'),
    'save-and-uninstall': () => dialogButton('Save and Uninstall'),
    'run-background': () => dialogButton('Run in Background'),
    'uninstall-result': () => resultTitle(' Uninstalled'),
    notification: () => document.querySelector<HTMLElement>('.vscode-standin'),
    'open-debug-logs': () => byText('.vscode-standin button', 'Open Debug Logs'),
    'flyout-health': () => document.querySelector<HTMLElement>('.db-drawer.open .integration-panel-health'),
    'flyout-retry': () => byText('.db-drawer.open button', 'Retry'),
    'flyout-fix': () => byText('.db-drawer.open button', 'Fix with AI'),
    retry: () => dialogButton('Retry'),
    'fix-with-ai': () => dialogButton('Fix with AI'),
    'project-menu': () => document.querySelector<HTMLElement>('[data-project="Kukla Luma"] [aria-label^="More actions"]'),
    'menu-reset': () => byText('[role=menuitem]', 'Reset'),
    'menu-delete': () => byText('[role=menuitem]', 'Delete'),
    // J7: the product's batch window (ProjectsBatchModal): its confirm, its Datapack Changes step, its run.
    'batch-question': () => batchWindow(/^(Reset|Delete) \d+ Projects?\?$/u),
    'save-and-reset': () => dialogButton('Save and Reset'),
    'run-reset': () => dialogButton('Reset ', true),
    'batch-run': () => inDialog('.projects-batch-run'),
    'batch-result': () => resultTitle('Projects Reset'),
    'reset-selected': () => byText('.j1-screen button', 'Reset Selected'),
    'j8-header': () => document.querySelector<HTMLElement>('.j8-header'),
    'install-from-file': () => byText('.j1-screen button', 'Install from File'),
    'card-tag': () => document.querySelector<HTMLElement>('[data-datapack="My Luma"] .datapack-card-tag'),
    'more-menu': () => [...document.querySelectorAll<HTMLElement>('[role=menu]')].find(visible) ?? null,
    'menu-delete-datapack': () => byText('[role=menuitem]', 'Delete'),
    'delete-question': () => [...document.querySelectorAll<HTMLElement>('[role=dialog]')].find((d) => visible(d) && (d.textContent ?? '').includes('Delete My Luma?')) ?? null,
    'menu-save-file': () => byText('[role=menuitem]', 'Save as File'),
    'add-from-file': () => byText('.j1-screen button', 'Add from File'),
    'dashboard-datapacks': () => document.querySelector<HTMLElement>('.j1-screen [data-action="dataInstaller"]'),
    // J3's small results: Saved to …, Saved as …, Created …, Last Save Undone.
    'done-result': () =>
        [...document.querySelectorAll<HTMLElement>('.modal-title')].find(
            (el) => visible(el) && /(Saved to|Saved as|Created|Last Save Undone)/u.test((el.textContent ?? '').trim()) && !el.closest('[role=dialog]')?.querySelector('.import-steps'),
        ) ?? null,
};

/** Where the callout goes: right of the target, else left, else under it; kept on screen. */
function place(rect: DOMRect): { left: number; top: number } {
    let left = rect.left;
    let top = rect.bottom + GAP;
    if (rect.right + GAP + CALLOUT_WIDTH < window.innerWidth) {
        left = rect.right + GAP;
        top = rect.top;
    } else if (rect.left - GAP - CALLOUT_WIDTH > 0) {
        left = rect.left - GAP - CALLOUT_WIDTH;
        top = rect.top;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - CALLOUT_WIDTH - 8));
    return { left, top: Math.max(8, Math.min(top, window.innerHeight - 220)) };
}

export interface TourProps {
    stops: TourStop[];
    journey: ReviewJourney;
    onExit: () => void;
    onRestart: () => void;
    /** A stop has begun: the screen sets what the stop says Commerce holds. */
    onStop?: (stop: TourStop) => void;
}

export function Tour({ stops, journey, onExit, onRestart, onStop }: TourProps): React.ReactElement {
    const [at, setAt] = useState(0);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const pressTarget = useRef<HTMLElement | null>(null);
    const stop = stops[at];

    useEffect(() => onStop?.(stop), [stop]); // eslint-disable-line react-hooks/exhaustive-deps

    // Follow the target: it moves when windows open, and does not exist while one is reading. A stop
    // that moves on by itself does so once its target, seen, has gone.
    useEffect(() => {
        let seen = false;
        const timer = setInterval(() => {
            const el = FIND[stop.point]();
            setRect(el ? el.getBoundingClientRect() : null);
            pressTarget.current = stop.press ? FIND[stop.press]() : null;
            if (el) seen = true;
            else if (seen && stop.onGone) {
                seen = false;
                setAt((n) => Math.min(n + 1, stops.length - 1));
            }
        }, POLL_MS);
        return () => clearInterval(timer);
    }, [stop, stops.length]);

    // A press on the stop's target moves the tour on. Capture phase on pointerdown: Spectrum opens a
    // menu as the press starts, so by pointerup its backdrop is under the pointer, and a menu item is
    // gone by the click.
    useEffect(() => {
        const onPress = (e: Event): void => {
            const target = pressTarget.current ?? (stop.press ? FIND[stop.press]() : null);
            if (target && e.target instanceof Node && target.contains(e.target)) {
                setRect(null);
                setAt((n) => Math.min(n + 1, stops.length - 1));
            }
        };
        document.addEventListener('pointerdown', onPress, true);
        return () => document.removeEventListener('pointerdown', onPress, true);
    }, [stop, stops.length]);

    const steps = new Map<string, BuiltStep>(journey.steps.filter((s): s is BuiltStep => s.window !== undefined).map((s) => [s.id, s]));
    const lines = (stop.decided ?? []).flatMap(([id, idx]) => idx.map((i) => steps.get(id)?.decided?.[i]).filter((l): l is string => Boolean(l)));
    const last = !stop.press && !stop.onGone;

    return createPortal(
        <div className="tour" data-react-aria-top-layer="true">
            {rect ? (
                <>
                    <div className="tour-ring" style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }} />
                    <div className="tour-callout" style={{ ...place(rect), width: CALLOUT_WIDTH }} role="dialog" aria-label="Guided tour">
                        <div className="tour-count">{`${journey.id} ${journey.name}, ${at + 1} of ${stops.length}`}</div>
                        <div className="tour-say">{stop.say}</div>
                        {lines.length ? (
                            <>
                                <div className="tour-sub">Decided</div>
                                <ul className="tour-decided">
                                    {lines.map((l) => (
                                        <li key={l}>{l}</li>
                                    ))}
                                </ul>
                            </>
                        ) : null}
                        <div className="tour-actions">
                            <button type="button" onClick={onRestart}>Restart</button>
                            <button type="button" onClick={onExit}>{last ? 'Finish' : 'Exit Tour'}</button>
                        </div>
                    </div>
                </>
            ) : (
                <div className="tour-wait">{`${journey.id} tour, ${at + 1} of ${stops.length}: waiting for the window…`}</div>
            )}
        </div>,
        document.body,
    );
}
