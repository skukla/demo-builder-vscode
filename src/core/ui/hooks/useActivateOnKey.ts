/**
 * useActivateOnKey — the Enter/Space contract for a div-role button.
 *
 * Spectrum's own controls handle this, but this extension renders a lot of
 * click-to-open TILES as `<div role="button" tabIndex={0}>` (cards, gallery
 * tiles, config tiles). Each of those has to answer Enter and Space itself and
 * call `preventDefault` — Space otherwise scrolls the page.
 *
 * That handler had been written five times (an architecture-duplication scan on
 * 2026-07-31 found it in IntegrationCard, BrandGallery, ConfigTile,
 * ProjectButton, and useProjectSelectHandlers), identical apart from what each
 * one invokes. A tile that forgets `preventDefault` is keyboard-hostile in a way
 * that is easy to ship and hard to notice.
 *
 * @module core/ui/hooks/useActivateOnKey
 */

import { useCallback } from 'react';

/**
 * Build the keydown handler for a div-role button.
 *
 * The callback receives the EVENT, not just a signal, because some callers read
 * modifiers off it (shift-click opens a project in a new window).
 *
 * @param onActivate - what Enter/Space should do
 * @param options.disabled - when true the keys are ignored (a non-interactive tile)
 * @returns a handler for the element's `onKeyDown`
 */
export function useActivateOnKey(
    onActivate: (event: React.KeyboardEvent) => void,
    options: { disabled?: boolean } = {},
): (event: React.KeyboardEvent) => void {
    const { disabled = false } = options;
    return useCallback(
        (event: React.KeyboardEvent): void => {
            if (disabled) return;
            if (event.key !== 'Enter' && event.key !== ' ') return;
            // Space scrolls the page otherwise — the reason this cannot be skipped.
            event.preventDefault();
            onActivate(event);
        },
        [onActivate, disabled],
    );
}
