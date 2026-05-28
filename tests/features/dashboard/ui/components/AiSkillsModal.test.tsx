/**
 * AiSkillsModal Tests
 *
 * The capability catalog reached from the dashboard's "View Skills" link: lean
 * name + description rows (no health checkmarks) plus a Regenerate AI files
 * action. Empty and error states use plain language.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import React from 'react';
import { AiSkillsModal } from '@/features/dashboard/ui/components/AiSkillsModal';
import type { SkillInventoryEntry } from '@/types/ai';
import '@testing-library/jest-dom';

const SKILLS: SkillInventoryEntry[] = [
    { name: 'Add a component', description: 'Adds a component to your project', path: '/p/.claude/skills/add-component.md', source: 'demo-builder' },
    { name: 'Sync changes', description: null, path: '/p/.claude/skills/sync-changes.md', source: 'demo-builder' },
];

function renderModal(props: Partial<React.ComponentProps<typeof AiSkillsModal>> = {}) {
    const onClose = jest.fn();
    const onRegenerate = jest.fn();
    render(
        <Provider theme={defaultTheme}>
            <AiSkillsModal
                skills={props.skills ?? []}
                onClose={onClose}
                onRegenerate={onRegenerate}
                hasError={props.hasError}
                isBusy={props.isBusy}
            />
        </Provider>,
    );
    return { onClose, onRegenerate };
}

describe('AiSkillsModal', () => {
    beforeEach(() => jest.clearAllMocks());

    it('lists each skill by name', () => {
        renderModal({ skills: SKILLS });
        expect(screen.getByText('Add a component')).toBeInTheDocument();
        expect(screen.getByText('Sync changes')).toBeInTheDocument();
    });

    it('does not render skill descriptions (lean name-only list)', () => {
        renderModal({ skills: SKILLS });
        expect(screen.queryByText('Adds a component to your project')).not.toBeInTheDocument();
    });

    it('frames the surface as capability discovery, not a health check', () => {
        renderModal({ skills: SKILLS });
        expect(screen.getByText(/what the ai can do/i)).toBeInTheDocument();
    });

    it('shows a plain-language empty state when there are no skills', () => {
        renderModal({ skills: [] });
        expect(screen.getByTestId('ai-skills-empty')).toBeInTheDocument();
    });

    it('shows an error row when the inspector errored', () => {
        renderModal({ skills: [], hasError: true });
        expect(screen.getByTestId('ai-skills-error')).toBeInTheDocument();
    });

    it('fires onRegenerate when "Regenerate AI files" is pressed', () => {
        const { onRegenerate } = renderModal({ skills: SKILLS });
        fireEvent.click(screen.getByRole('button', { name: /regenerate ai files/i }));
        expect(onRegenerate).toHaveBeenCalledTimes(1);
    });

    it('disables Regenerate while a verify/regenerate operation is busy', () => {
        renderModal({ skills: SKILLS, isBusy: true });
        // The shared Modal renders actions as accessible div-buttons (aria-disabled),
        // not native <button disabled>.
        expect(screen.getByRole('button', { name: /regenerate ai files/i }))
            .toHaveAttribute('aria-disabled', 'true');
    });
});
