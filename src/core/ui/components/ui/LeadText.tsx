/**
 * The sentence at the top of a modal step saying what it is for: grey, 13px, with room to
 * breathe under it.
 *
 * Extracted 2026-10-20 (PL-80) from the add-integration flow's `.intflow-stage-lead`, for
 * the Updates modal on the projects list, with `SectionLabel` and for the same reason. The
 * rule moved unchanged to `core/ui/styles/modal-text.css`.
 *
 * @module core/ui/components/ui/LeadText
 */

import React from 'react';

/** A modal step's opening sentence. */
export function LeadText({ children }: { children: React.ReactNode }): React.ReactElement {
    return <p className="lead-text">{children}</p>;
}
