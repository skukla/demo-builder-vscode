/**
 * InstalledSkillsModal Tests (Batch F4)
 *
 * Thin wrapper: confirms the modal renders the grouped list inside the
 * shared Modal chrome and that the Close button dismisses via onClose.
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme, DialogContainer } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { InstalledSkillsModal } from '@/features/dashboard/ui/aiSurface/components/InstalledSkillsModal';
import type { SkillInventoryEntry } from '@/types/ai';

function makeSkill(overrides: Partial<SkillInventoryEntry> = {}): SkillInventoryEntry {
    return {
        name: 'add-component',
        description: 'Adds a component to a project.',
        path: '/p/.claude/skills/add-component.md',
        source: 'demo-builder',
        ...overrides,
    };
}

function renderModal(skills: SkillInventoryEntry[], onClose = jest.fn(), hasError = false) {
    return render(
        <Provider theme={defaultTheme}>
            <DialogContainer onDismiss={onClose}>
                <InstalledSkillsModal skills={skills} hasError={hasError} onClose={onClose} />
            </DialogContainer>
        </Provider>,
    );
}

describe('InstalledSkillsModal', () => {
    it('renders the "Installed skills" heading', () => {
        renderModal([makeSkill({ name: 'add-component', path: '/a' })]);
        expect(screen.getByRole('heading', { name: /installed skills/i })).toBeInTheDocument();
    });

    it('renders the grouped skills list inside the modal', () => {
        renderModal([
            makeSkill({ name: 'add-component', source: 'demo-builder', path: '/a' }),
            makeSkill({ name: 'adobe-skill', source: 'adobe', path: '/b' }),
        ]);
        expect(screen.getByTestId('ai-installed-skills-list')).toBeInTheDocument();
        expect(screen.getByTestId('ai-skill-group-demo-builder')).toBeInTheDocument();
        expect(screen.getByTestId('ai-skill-group-adobe')).toBeInTheDocument();
    });

    it('does NOT render skill descriptions', () => {
        renderModal([
            makeSkill({
                name: 'add-component',
                description: 'Adds a component to a project.',
                path: '/a',
                source: 'demo-builder',
            }),
        ]);
        expect(screen.queryByText('Adds a component to a project.')).not.toBeInTheDocument();
    });

    it('renders the error row when hasError is true', () => {
        renderModal([], jest.fn(), true);
        expect(screen.getByTestId('ai-installed-skills-error')).toBeInTheDocument();
    });

    it('clicking Close fires onClose', async () => {
        const onClose = jest.fn();
        renderModal([makeSkill({ name: 'add-component', path: '/a' })], onClose);
        const closeButton = screen.getByRole('button', { name: /close/i });
        await act(async () => {
            fireEvent.click(closeButton);
        });
        expect(onClose).toHaveBeenCalled();
    });
});
