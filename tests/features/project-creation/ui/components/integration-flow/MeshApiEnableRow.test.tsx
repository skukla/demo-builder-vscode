/**
 * MeshApiEnableRow Tests
 *
 * PURELY VISUAL. The enable is owned by the Add Integration modal (which only
 * commits a mesh on a successful enable) and re-subscribed at deploy, so a
 * committed mesh's APIs are always enabled. This row just shows ✓ "API access
 * enabled" once a destination is committed — it NEVER issues a request (so
 * re-mounting the step, e.g. navigating to the summary and back, cannot
 * re-enable).
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';

import { MeshApiEnableRow } from '@/features/project-creation/ui/components/integration-flow/MeshApiEnableRow';

function renderRow(props: { workspaceId?: string; label?: string } = { workspaceId: 'ws-1' }) {
    return render(
        <Provider theme={defaultTheme} colorScheme="light">
            <MeshApiEnableRow {...props} />
        </Provider>
    );
}

describe('MeshApiEnableRow (purely visual)', () => {
    it('shows the ✓ "API access enabled" confirmation once a workspace is committed', () => {
        const { container } = renderRow({ workspaceId: 'ws-1' });

        expect(screen.getByText('API access enabled')).toBeInTheDocument();
        // The ✓ badge, never a spinner (no request in flight — there is no request).
        expect(container.querySelector('.int-chosen-check')).not.toBeNull();
        expect(container.querySelector('.int-enable-status')).not.toBeNull();
    });

    it('renders nothing until a destination workspace is committed', () => {
        const { container } = renderRow({ workspaceId: undefined });
        // The component returns null (the Provider wrapper is the only element).
        expect(container.querySelector('.int-enable-status')).toBeNull();
        expect(screen.queryByText('API access enabled')).not.toBeInTheDocument();
    });

    it('has no Retry or Change affordance — it is a static confirmation', () => {
        renderRow({ workspaceId: 'ws-1' });
        expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /change/i })).not.toBeInTheDocument();
        // No live spinner either.
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('honors a custom label', () => {
        renderRow({ workspaceId: 'ws-1', label: 'Integration API access' });
        expect(screen.getByText('Integration API access enabled')).toBeInTheDocument();
    });
});
