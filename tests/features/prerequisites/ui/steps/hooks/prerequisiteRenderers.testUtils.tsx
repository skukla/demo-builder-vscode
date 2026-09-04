/**
 * Shared setup for the `prerequisiteRenderers` suites.
 *
 * The renderers are pure functions returning React nodes, so every suite needs the
 * same three things: a check fixture, the visible text of a node, and its markup.
 * No jest.mock lives here — there is nothing to wall off, and a mock declared in a
 * shared file registers too late to help the suite that imports it.
 */

import { render } from '@testing-library/react';
import React from 'react';
import type { PrerequisiteCheck } from '@/types/webview';

/**
 * The visible text of a rendered node, with the Spectrum icon mock's own `<title>`
 * removed — it writes the literal "DefaultIcon" into textContent for every workflow
 * icon, which is test scaffolding rather than anything a reader of the screen sees.
 */
export function text(node: React.ReactNode): string {
    const { container } = render(<>{node}</>);
    container.querySelectorAll('title').forEach((t) => t.remove());
    return container.textContent ?? '';
}

/** The rendered markup of a node, for the classes that distinguish one icon from another. */
export function html(node: React.ReactNode): string {
    return render(<>{node}</>).container.innerHTML;
}

/** A prerequisite check with only the fields a renderer reads. */
export function makeCheck(over: Partial<PrerequisiteCheck> = {}): PrerequisiteCheck {
    return { name: 'Adobe I/O CLI', description: 'CLI for Adobe services', status: 'success', ...over };
}
