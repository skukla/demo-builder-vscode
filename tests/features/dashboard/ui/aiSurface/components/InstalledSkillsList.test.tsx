/**
 * InstalledSkillsList Tests (Batch F4)
 *
 * Verifies the inline replacement for InstalledSkillsDialog:
 *   - Skills are grouped by source (demo-builder → adobe → unknown)
 *   - Each group renders a status icon + label + count
 *   - Skill names are shown; descriptions are intentionally NOT shown
 *   - hasError replaces the list with a warning row
 *   - Empty inventory renders a "No skills detected" line
 */

import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { InstalledSkillsList } from '@/features/dashboard/ui/aiSurface/components/InstalledSkillsList';
import type { SkillInventoryEntry, SkillSource } from '@/types/ai';

function makeSkill(overrides: Partial<SkillInventoryEntry> = {}): SkillInventoryEntry {
    return {
        name: 'add-component',
        description: 'Adds a component to a project.',
        path: '/p/.claude/skills/add-component.md',
        source: 'demo-builder',
        ...overrides,
    };
}

function renderList(skills: SkillInventoryEntry[], hasError = false) {
    return render(
        <Provider theme={defaultTheme}>
            <InstalledSkillsList skills={skills} hasError={hasError} />
        </Provider>,
    );
}

describe('InstalledSkillsList', () => {
    describe('grouping', () => {
        it('renders one group per distinct skill source', () => {
            renderList([
                makeSkill({ name: 'add-component', source: 'demo-builder', path: '/a' }),
                makeSkill({ name: 'aem-block-developer', source: 'adobe', path: '/b' }),
                makeSkill({ name: 'mystery', source: 'unknown', path: '/c' }),
            ]);
            expect(screen.getByTestId('ai-skill-group-demo-builder')).toBeInTheDocument();
            expect(screen.getByTestId('ai-skill-group-adobe')).toBeInTheDocument();
            expect(screen.getByTestId('ai-skill-group-unknown')).toBeInTheDocument();
        });

        it('omits a group when no skills match its source', () => {
            renderList([
                makeSkill({ name: 'add-component', source: 'demo-builder', path: '/a' }),
            ]);
            expect(screen.getByTestId('ai-skill-group-demo-builder')).toBeInTheDocument();
            expect(screen.queryByTestId('ai-skill-group-adobe')).not.toBeInTheDocument();
            expect(screen.queryByTestId('ai-skill-group-unknown')).not.toBeInTheDocument();
        });

        it('orders groups: demo-builder, then adobe, then unknown', () => {
            renderList([
                makeSkill({ name: 'mystery', source: 'unknown' as SkillSource, path: '/c' }),
                makeSkill({ name: 'adobe-skill', source: 'adobe', path: '/b' }),
                makeSkill({ name: 'demo-skill', source: 'demo-builder', path: '/a' }),
            ]);
            const list = screen.getByTestId('ai-installed-skills-list');
            const groups = within(list).getAllByText(/^(Demo Builder|Adobe|Other) \(/);
            const labels = groups.map(el => el.textContent ?? '');
            expect(labels[0]).toMatch(/^Demo Builder/);
            expect(labels[1]).toMatch(/^Adobe/);
            expect(labels[2]).toMatch(/^Other/);
        });

        it('renders the per-group count alongside the label', () => {
            renderList([
                makeSkill({ name: 'a', source: 'demo-builder', path: '/a' }),
                makeSkill({ name: 'b', source: 'demo-builder', path: '/b' }),
                makeSkill({ name: 'c', source: 'adobe', path: '/c' }),
            ]);
            expect(screen.getByText('Demo Builder (2)')).toBeInTheDocument();
            expect(screen.getByText('Adobe (1)')).toBeInTheDocument();
        });
    });

    describe('skill rendering', () => {
        it('shows the skill name', () => {
            renderList([
                makeSkill({ name: 'add-component', source: 'demo-builder', path: '/a' }),
            ]);
            expect(screen.getByText('add-component')).toBeInTheDocument();
        });

        it('does NOT show the skill description', () => {
            renderList([
                makeSkill({
                    name: 'add-component',
                    description: 'Adds a component to a project.',
                    source: 'demo-builder',
                    path: '/a',
                }),
            ]);
            expect(screen.queryByText('Adds a component to a project.')).not.toBeInTheDocument();
        });

        it('sorts skill names alphabetically within a group', () => {
            renderList([
                makeSkill({ name: 'zeta-skill', source: 'demo-builder', path: '/z' }),
                makeSkill({ name: 'alpha-skill', source: 'demo-builder', path: '/a' }),
                makeSkill({ name: 'mu-skill', source: 'demo-builder', path: '/m' }),
            ]);
            const group = screen.getByTestId('ai-skill-group-demo-builder');
            const names = within(group)
                .getAllByText(/-skill$/)
                .map(el => el.textContent);
            expect(names).toEqual(['alpha-skill', 'mu-skill', 'zeta-skill']);
        });
    });

    describe('empty state', () => {
        it('renders "No skills detected." when the list is empty', () => {
            renderList([]);
            expect(screen.getByText(/no skills detected/i)).toBeInTheDocument();
        });
    });

    describe('error state', () => {
        it('replaces the list with a warning row when hasError is true', () => {
            renderList(
                [
                    makeSkill({ name: 'add-component', source: 'demo-builder', path: '/a' }),
                ],
                true,
            );
            expect(screen.getByTestId('ai-installed-skills-error')).toBeInTheDocument();
            expect(screen.queryByTestId('ai-skill-group-demo-builder')).not.toBeInTheDocument();
            expect(screen.getByText(/couldn['’]t inspect skills/i)).toBeInTheDocument();
        });
    });
});
