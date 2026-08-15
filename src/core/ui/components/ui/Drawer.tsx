/**
 * Drawer — a hand-rolled right-panel primitive. Presentation-agnostic: hosts
 * whatever children the caller renders.
 *
 * Promoted here from `features/dashboard/ui/components/integrations/` when the
 * Data Installer detail pane became its second consumer, which is the trigger
 * its previous docstring named. Behaviour-preserving move: the integrations
 * suites passed unedited across it.
 *
 * Its CSS lives in the "Integrations grid + drawer" section of
 * custom-spectrum.css. The classes (`db-drawer`, `db-drawer-scrim`) were already
 * generically named, so nothing moved with it — only that section comment is now
 * narrower than its contents.
 *
 * Why not Spectrum Tray: it's mobile-only and unmocked in the test stack.
 * Instead: an always-mounted plain-div scrim + panel pair whose `.open`
 * class drives the slide (`translateX(100%) → 0`, visibility:hidden when
 * closed — see the "Integrations grid + drawer" section of
 * custom-spectrum.css).
 *
 * Behavior contract (test-pinned):
 *   - scrim click and document Esc close; Esc is SKIPPED when
 *     `event.defaultPrevented` so a stacked Spectrum dialog owns its own Esc
 *   - on open the opener (`document.activeElement`) is captured and the
 *     panel's first focusable receives focus; on close focus returns to the
 *     captured opener
 *   - minimal Tab wrap (Tab on last focusable → first; Shift+Tab on first →
 *     last) — deliberately NOT react-aria FocusScope (transitive dep; YAGNI)
 *
 * @module core/ui/components/ui/Drawer
 */

import React, { useEffect, useRef } from 'react';
import { cn } from '@/core/ui/utils/classNames';

export interface DrawerProps {
    /** Whether the panel is slid in (the pair stays mounted either way). */
    isOpen: boolean;
    /** Called on scrim click and un-prevented document Escape. */
    onClose: () => void;
    /** Accessible name for the dialog panel. */
    ariaLabel: string;
    /** Drawer content (head/body/actions are the caller's concern). */
    children: React.ReactNode;
}

/** The tab-order query behind first-focus and the minimal Tab wrap. */
const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** The always-mounted scrim + sliding dialog panel. */
export function Drawer({ isOpen, onClose, ariaLabel, children }: DrawerProps): React.ReactElement {
    const panelRef = useRef<HTMLDivElement>(null);
    /** The element focused when the drawer opened; focus returns here on close. */
    const openerRef = useRef<HTMLElement | null>(null);

    // Document-level Esc while open. Skipped when a stacked dialog already
    // consumed (defaultPrevented) the event — double-Esc must not fall through.
    useEffect(() => {
        if (!isOpen) return undefined;
        const handleKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape' && !event.defaultPrevented) onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Focus hand-off: capture the opener and enter the panel on open; restore
    // the opener on close.
    useEffect(() => {
        if (isOpen) {
            openerRef.current = document.activeElement as HTMLElement | null;
            const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
            (first ?? panelRef.current)?.focus();
        } else if (openerRef.current) {
            openerRef.current.focus();
            openerRef.current = null;
        }
    }, [isOpen]);

    // Minimal focus trap: wrap Tab at the panel's edges.
    const handleTabWrap = (event: React.KeyboardEvent): void => {
        if (event.key !== 'Tab') return;
        const focusables = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    return (
        <>
            {/* Backdrop dismiss only; Esc handling lives on the document listener. */}
            <div
                className={cn('db-drawer-scrim', isOpen && 'open')}
                aria-hidden="true"
                onClick={isOpen ? onClose : undefined}
            />
            <div
                ref={panelRef}
                className={cn('db-drawer', isOpen && 'open')}
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel}
                aria-hidden={isOpen ? undefined : 'true'}
                tabIndex={-1}
                onKeyDown={handleTabWrap}
            >
                {children}
            </div>
        </>
    );
}
