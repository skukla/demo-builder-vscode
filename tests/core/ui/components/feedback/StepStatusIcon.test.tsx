/**
 * StepStatusIcon — every status draws its own icon, told apart by the class each asks
 * for: the Spectrum icon mock collapses all workflow icons to one element.
 */

import { render } from '@testing-library/react';
import React from 'react';
import { StepStatusIcon, type StepStatus } from '@/core/ui/components/feedback/StepStatusIcon';

function markup(node: React.ReactNode): string {
    return render(<>{node}</>).container.innerHTML;
}

describe('StepStatusIcon', () => {
    it('marks success with the green tick', () => {
        expect(markup(<StepStatusIcon status="success" />)).toContain('class="text-green-600"');
    });

    it('marks error with the red cross', () => {
        expect(markup(<StepStatusIcon status="error" />)).toContain('class="text-red-600"');
    });

    it('marks warning with the yellow alert', () => {
        expect(markup(<StepStatusIcon status="warning" />)).toContain('class="text-yellow-600"');
    });

    it('shows a spinner, not an icon, while a check is running', () => {
        const html = markup(<StepStatusIcon status="checking" />);
        expect(html).toContain('role="progressbar"');
        expect(html).not.toContain('text-');
    });

    it('shows an unstyled pending icon for a check that has not started', () => {
        const html = markup(<StepStatusIcon status="pending" />);
        expect(html).toContain('<svg');
        expect(html).not.toContain('class=');
        expect(html).not.toContain('role="progressbar"');
    });

    it('gives every status its own icon', () => {
        const statuses: StepStatus[] = ['success', 'error', 'warning', 'checking', 'pending'];
        const rendered = statuses.map((s) => markup(<StepStatusIcon status={s} />));
        expect(new Set(rendered).size).toBe(statuses.length);
    });
});
