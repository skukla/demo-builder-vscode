/**
 * CardActionsMenu — the kebab-menu SHELL shared by every card grid.
 *
 * Cards in this extension live inside click-to-open tiles, so their overflow
 * menu always needs the same four things: a containment wrapper (a menu click
 * must not open the card), a `MenuTrigger`, a quiet kebab `ActionButton`, and a
 * `Menu` that routes `onAction`. That shell had been written twice — once in
 * `ProjectActionsMenu` and once inline in `IntegrationCard` — the second time by
 * copying the pattern from a comment naming the first (2026-07-31).
 *
 * Sharing the shell matters more than the line count: Spectrum menu composition
 * is a documented minefield (`Section` children are typed `ItemElement[]`, a
 * `false` child breaks where `null` is fine, and the test mock must mirror the
 * composition — see the `spectrum-webview-ui` skill). Two implementations mean
 * two places for that to go wrong.
 *
 * CONTENT stays with the caller: pass `Item`s for a flat menu, or
 * `Section`/`SubmenuTrigger` for a grouped one. Forcing one content model on
 * both callers would have been the worse abstraction.
 *
 * @module core/ui/components/ui/CardActionsMenu
 */

import { ActionButton, Menu, MenuTrigger } from '@adobe/react-spectrum';
import type { CollectionChildren } from '@react-types/shared';
import MoreSmallListVert from '@spectrum-icons/workflow/MoreSmallListVert';
import React, { useCallback } from 'react';

export interface CardActionsMenuProps {
    /** Names the menu for screen readers, e.g. `More actions for ERP Sync`. */
    ariaLabel: string;
    /** Fires with the chosen `Item`'s key. */
    onAction: (key: React.Key) => void;
    /** Class for the trigger button (e.g. the hover-reveal rule). */
    className?: string;
    /**
     * `Item`s, or `Section`/`SubmenuTrigger` for a grouped menu.
     *
     * **Use `cond ? <Item/> : null`, never `cond && <Item/>`** — Spectrum's
     * collection rejects a `false` child at runtime (`spectrum-webview-ui`).
     */
    children: React.ReactNode;
}

/**
 * The kebab menu for a card.
 *
 * @param props - aria label, action handler, optional trigger class, menu content
 * @returns the contained menu trigger
 */
export function CardActionsMenu({
    ariaLabel,
    onAction,
    className,
    children,
}: CardActionsMenuProps): React.ReactElement {
    // Containment: opening the menu or picking an item must never bubble into the
    // hosting tile's click/keydown handlers and open the card behind it.
    const contain = useCallback((event: React.SyntheticEvent): void => {
        event.stopPropagation();
    }, []);

    return (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- containment only; interaction lives on the child MenuTrigger/ActionButton
        <div onClick={contain} onKeyDown={contain}>
            <MenuTrigger>
                <ActionButton isQuiet aria-label={ariaLabel} UNSAFE_className={className}>
                    <MoreSmallListVert size="S" />
                </ActionButton>
                {/* Spectrum types Menu's children as `CollectionChildren`, a shape
                    a `ReactNode` prop cannot satisfy. The cast lives HERE, once, so
                    callers keep an ordinary children prop instead of each fighting
                    the collection types — one of the reasons this shell is shared.

                    It NAMES its target. The bottom-type spelling this replaced on
                    2026-09-01 silenced the same error while telling the reader
                    nothing — it reads as "nothing fits" when the truth is that
                    Spectrum's collection type fits and ReactNode cannot express it.
                    That change took src/ to zero type-erasing casts, which is what
                    let them be banned there outright.

                    Written without quoting the spellings themselves: the boundary
                    cast ratchet matches per LINE and only skips lines that START
                    with a comment marker, so a continuation line naming one is
                    counted as a cast. */}
                <Menu onAction={onAction}>{children as unknown as CollectionChildren<object>}</Menu>
            </MenuTrigger>
        </div>
    );
}
