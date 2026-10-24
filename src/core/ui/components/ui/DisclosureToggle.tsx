/**
 * The line that opens and closes a part of a modal: its name, an optional note beside it,
 * and the chevron at the end, in the projects list's own row style.
 *
 * Extracted 2026-10-23 (EDS-64) from the Updates modal's group toggle (PL-80) for the
 * storefront report's fold, in place of the browser's own `<details>` triangle, a look
 * nothing else in the extension has. The report window was removed the same day; the Updates
 * modal is its one user today. Spectrum's Disclosure was tried for the Updates modal first
 * and rejected for the same reason (owner, 2026-10-20). The rules
 * moved unchanged, in the same layer, to `core/ui/styles/disclosure-toggle.css`, which each
 * host bundle imports.
 *
 * The caller owns whether it is open, and hides what it opens (`hidden={!isOpen}`), so the
 * part can sit anywhere in the caller's layout.
 *
 * @module core/ui/components/ui/DisclosureToggle
 */

import ChevronDown from '@spectrum-icons/workflow/ChevronDown';
import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import React from 'react';

export interface DisclosureToggleProps {
    isOpen: boolean;
    onToggle: () => void;
    /** The part's name, drawn as written. */
    children: React.ReactNode;
    /** A short line beside the name that a closed part must not hide. */
    note?: string;
}

/** The opening line of a part of a modal. */
export function DisclosureToggle({ isOpen, onToggle, children, note }: DisclosureToggleProps): React.ReactElement {
    const Chevron = isOpen ? ChevronDown : ChevronRight;
    return (
        <button type="button" className="disclosure-toggle" aria-expanded={isOpen} onClick={onToggle}>
            <span className="disclosure-toggle-name">{children}</span>
            {note && <span className="disclosure-toggle-note">{note}</span>}
            <Chevron size="S" UNSAFE_className="disclosure-toggle-chevron" />
        </button>
    );
}
