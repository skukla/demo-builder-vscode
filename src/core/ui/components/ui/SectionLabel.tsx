/**
 * The small grey capitals over a group inside a modal: "Start from", "How to send it",
 * "Products each ERP will own", a project's name in the Updates list.
 *
 * Extracted 2026-10-20 (PL-80) from the add-integration flow's `.intflow-section-label`,
 * which five modals already used, when the Updates modal on the projects list needed it:
 * that class lived in a project-creation sheet the projects list does not load (ADR-017
 * §6). The rule moved unchanged, in the same layer, to `core/ui/styles/modal-text.css`,
 * which each host bundle imports.
 *
 * @module core/ui/components/ui/SectionLabel
 */

import React from 'react';

/** A group's label inside a modal. */
export function SectionLabel({ children }: { children: React.ReactNode }): React.ReactElement {
    return <p className="section-label">{children}</p>;
}
