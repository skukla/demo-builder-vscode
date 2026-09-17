/**
 * The linked-card row and card face, rendered against the SHARED Spectrum stand-in
 * (`tests/__mocks__/@adobe/react-spectrum.tsx`), not a per-suite one.
 *
 * The shared stand-in keeps the real Link's one-child rule; per-suite mocks do not.
 * That rule is why a crash reached a live window: a Link with two children and no
 * `href` makes Spectrum call `React.Children.only`, and the throw blanked the
 * integrations surface (2026-09-16) while suites with a lax Link stayed green.
 *
 * So this file adds no Spectrum mock of its own. It proves the pieces mount; their
 * logic is tested elsewhere.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { IntegrationCard } from '@/core/ui/components/integrations/IntegrationCard';
import { LinkedSection } from '@/features/dashboard/ui/components/integrations/LinkedSection';
import type { IntegrationCardModel } from '@/core/ui/components/integrations/integrationCardModel.types';

const MODEL: IntegrationCardModel = {
    id: 'demo-erp',
    isMesh: false,
    isSystem: true,
    typeBadge: 'ERP',
    name: 'Nordwind',
    kindLabel: 'ERP',
    sourceLine: 'skukla/demo-erp',
    sourceIsAi: false,
    status: 'deployed',
    statusLabel: 'Deployed',
    dotVariant: 'success',
    urlLabel: 'Screen',
    menuActions: [],
    canRename: false,
    linked: {
        label: 'Used by',
        cards: [{ id: 'erp-integration', name: 'ERP integration', status: 'deployed', statusLabel: 'Deployed', dotVariant: 'success' }],
    },
};

function mount(node: React.ReactElement) {
    return render(node);
}

describe('linked cards against real Spectrum', () => {
    it('the Used by row mounts, and its link is one child', () => {
        mount(<LinkedSection model={MODEL} onOpenLinked={jest.fn()} />);

        expect(screen.getByText('ERP integration · Deployed')).toBeInTheDocument();
    });

    it('the card face mounts with its badge and link line', () => {
        mount(<IntegrationCard model={MODEL} onAction={jest.fn()} onRename={jest.fn()} />);

        expect(screen.getByText('ERP')).toBeInTheDocument();
        expect(screen.getByTitle('Used by ERP integration')).toBeInTheDocument();
    });

    it('renders no row for a card that stands alone', () => {
        const { container } = mount(<LinkedSection model={{ ...MODEL, linked: undefined }} onOpenLinked={jest.fn()} />);

        expect(container.querySelector('[data-testid="linked-card"]')).toBeNull();
    });
});
