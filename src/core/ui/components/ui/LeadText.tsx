/**
 * The sentence at the top of a modal step saying what it is for: 14px, with room to breathe
 * under it, stopping at about 60 characters a line. `sentences` draws it at 16px, for a window
 * whose body is only sentences; the layout components set it, a caller does not.
 *
 * Extracted 2026-10-20 (PL-80) from the add-integration flow's `.intflow-stage-lead`, for
 * the Updates modal on the projects list, with `SectionLabel` and for the same reason. The
 * rule moved unchanged to `core/ui/styles/modal-text.css`.
 *
 * @module core/ui/components/ui/LeadText
 */

import React from 'react';

/** A modal step's opening sentence. */
export function LeadText({ children, sentences = false }: {
    children: React.ReactNode;
    /** The window's body is only sentences: lead at 16px. */
    sentences?: boolean;
}): React.ReactElement {
    return <p className={sentences ? 'lead-text lead-text-sentences' : 'lead-text'}>{children}</p>;
}
