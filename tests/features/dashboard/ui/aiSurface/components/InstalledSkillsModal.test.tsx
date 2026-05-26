/**
 * InstalledSkillsModal Tests
 *
 * The modal wraps the grouped skills list inside the shared Modal chrome and
 * exposes the project's one AI maintenance action — Regenerate AI files — as
 * a footer action button. (Refresh is implicit: the parent re-inspects on
 * modal open.)
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

interface RenderOptions {
    skills?: SkillInventoryEntry[];
    onClose?: () => void;
    onRegenerate?: () => void | Promise<void>;
    isBusy?: boolean;
    hasError?: boolean;
}

function renderModal(opts: RenderOptions = {}) {
    const onClose = opts.onClose ?? jest.fn();
    const onRegenerate = opts.onRegenerate ?? jest.fn();
    return {
        onClose,
        onRegenerate,
        ...render(
            <Provider theme={defaultTheme}>
                <DialogContainer onDismiss={onClose}>
                    <InstalledSkillsModal
                        skills={opts.skills ?? [makeSkill({ name: 'add-component', path: '/a' })]}
                        hasError={opts.hasError ?? false}
                        onClose={onClose}
                        onRegenerate={onRegenerate}
                        isBusy={opts.isBusy ?? false}
                    />
                </DialogContainer>
            </Provider>,
        ),
    };
}

describe('InstalledSkillsModal', () => {
    it('renders the "Installed skills" heading', () => {
        renderModal();
        expect(screen.getByRole('heading', { name: /installed skills/i })).toBeInTheDocument();
    });

    it('renders the grouped skills list inside the modal', () => {
        renderModal({
            skills: [
                makeSkill({ name: 'add-component', source: 'demo-builder', path: '/a' }),
                makeSkill({ name: 'adobe-skill', source: 'adobe', path: '/b' }),
            ],
        });
        expect(screen.getByTestId('ai-installed-skills-list')).toBeInTheDocument();
        expect(screen.getByTestId('ai-skill-group-demo-builder')).toBeInTheDocument();
        expect(screen.getByTestId('ai-skill-group-adobe')).toBeInTheDocument();
    });

    it('does NOT render skill descriptions', () => {
        renderModal({
            skills: [
                makeSkill({
                    name: 'add-component',
                    description: 'Adds a component to a project.',
                    path: '/a',
                    source: 'demo-builder',
                }),
            ],
        });
        expect(screen.queryByText('Adds a component to a project.')).not.toBeInTheDocument();
    });

    it('renders the error row when hasError is true', () => {
        renderModal({ skills: [], hasError: true });
        expect(screen.getByTestId('ai-installed-skills-error')).toBeInTheDocument();
    });

    it('clicking Close fires onClose', async () => {
        const { onClose } = renderModal();
        const closeButton = screen.getByRole('button', { name: /close/i });
        await act(async () => {
            fireEvent.click(closeButton);
        });
        expect(onClose).toHaveBeenCalled();
    });

    describe('Regenerate AI files action', () => {
        it('renders the Regenerate AI files action button in the footer', () => {
            renderModal();
            expect(screen.getByRole('button', { name: /regenerate ai files/i })).toBeInTheDocument();
        });

        it('does NOT render a Refresh action button (refresh is implicit on modal open)', () => {
            renderModal();
            expect(screen.queryByRole('button', { name: /^refresh$/i })).not.toBeInTheDocument();
        });

        it('clicking Regenerate AI files fires onRegenerate', async () => {
            const { onRegenerate } = renderModal();
            const regenButton = screen.getByRole('button', { name: /regenerate ai files/i });
            await act(async () => {
                fireEvent.click(regenButton);
            });
            expect(onRegenerate).toHaveBeenCalled();
        });

        it('Regenerate is disabled when isBusy is true', () => {
            renderModal({ isBusy: true });
            const regenButton = screen.getByRole('button', { name: /regenerate ai files/i });
            expect(regenButton).toHaveAttribute('aria-disabled', 'true');
        });

        it('Regenerate is enabled when isBusy is false', () => {
            renderModal({ isBusy: false });
            const regenButton = screen.getByRole('button', { name: /regenerate ai files/i });
            expect(regenButton).not.toHaveAttribute('aria-disabled', 'true');
        });

        it('does not call onRegenerate when clicked while isBusy is true', async () => {
            const { onRegenerate } = renderModal({ isBusy: true });
            const regenButton = screen.getByRole('button', { name: /regenerate ai files/i });
            await act(async () => {
                fireEvent.click(regenButton);
            });
            expect(onRegenerate).not.toHaveBeenCalled();
        });
    });
});
