/**
 * AiSkillsList Tests
 *
 * The skills section always shows the summary line and the group rows.
 * Each group row is itself a disclosure — clicking it reveals the group's
 * alphabetized skill names; clicking again hides them. Groups expand
 * independently. There is no outer toggle.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import React from 'react';
import { AiSkillsList } from '@/features/dashboard/ui/components/AiSkillsList';
import type { SkillInventoryEntry } from '@/types/ai';
import '@testing-library/jest-dom';

function makeSkill(name: string, source: SkillInventoryEntry['source']): SkillInventoryEntry {
    return { name, description: null, path: `/p/.claude/skills/${name}.md`, source };
}

function renderList(props: Partial<React.ComponentProps<typeof AiSkillsList>> = {}) {
    return render(
        <Provider theme={defaultTheme}>
            <AiSkillsList skills={props.skills ?? []} hasError={props.hasError} />
        </Provider>,
    );
}

describe('AiSkillsList', () => {
    describe('Default state — groups visible, individually collapsed', () => {
        it('shows a "Skills · N installed" summary line with the total count', () => {
            renderList({
                skills: [
                    makeSkill('add-component', 'demo-builder'),
                    makeSkill('sync-changes', 'demo-builder'),
                    makeSkill('aem-tester', 'adobe'),
                ],
            });

            const summary = screen.getByTestId('ai-skills-summary');
            expect(summary).toHaveTextContent(/Skills/);
            expect(summary).toHaveTextContent(/3 installed/);
        });

        it('renders group rows with their counts by default (no outer toggle)', () => {
            renderList({
                skills: [
                    makeSkill('add-component', 'demo-builder'),
                    makeSkill('sync-changes', 'demo-builder'),
                    makeSkill('aem-tester', 'adobe'),
                ],
            });

            const dbRow = screen.getByTestId('ai-skills-group-demo-builder');
            expect(dbRow).toHaveTextContent(/Demo Builder/);
            expect(dbRow).toHaveTextContent(/2/);

            const adobeRow = screen.getByTestId('ai-skills-group-adobe');
            expect(adobeRow).toHaveTextContent(/Adobe AEM/);
            expect(adobeRow).toHaveTextContent(/1/);
        });

        it('renders groups in canonical order: Demo Builder → Adobe AEM → Custom', () => {
            renderList({
                skills: [
                    makeSkill('zeta', 'unknown'),
                    makeSkill('beta', 'adobe'),
                    makeSkill('alpha', 'demo-builder'),
                ],
            });

            const rows = screen.getAllByTestId(/^ai-skills-group-/);
            const ids = rows.map(r => r.getAttribute('data-testid'));
            expect(ids).toEqual([
                'ai-skills-group-demo-builder',
                'ai-skills-group-adobe',
                'ai-skills-group-unknown',
            ]);
        });

        it('omits groups with no skills', () => {
            renderList({ skills: [makeSkill('add-component', 'demo-builder')] });

            expect(screen.getByTestId('ai-skills-group-demo-builder')).toBeInTheDocument();
            expect(screen.queryByTestId('ai-skills-group-adobe')).not.toBeInTheDocument();
            expect(screen.queryByTestId('ai-skills-group-unknown')).not.toBeInTheDocument();
        });

        it('does not render skill names until a group is expanded', () => {
            renderList({
                skills: [
                    makeSkill('add-component', 'demo-builder'),
                    makeSkill('aem-tester', 'adobe'),
                ],
            });
            expect(screen.queryByText('add-component')).not.toBeInTheDocument();
            expect(screen.queryByText('aem-tester')).not.toBeInTheDocument();
        });
    });

    describe('Per-group expansion', () => {
        it('reveals skill names when a group is clicked', () => {
            renderList({
                skills: [
                    makeSkill('zeta', 'demo-builder'),
                    makeSkill('alpha', 'demo-builder'),
                ],
            });

            fireEvent.click(screen.getByTestId('ai-skills-group-demo-builder'));

            expect(screen.getByText('alpha')).toBeInTheDocument();
            expect(screen.getByText('zeta')).toBeInTheDocument();
        });

        it('sorts skills alphabetically within an expanded group', () => {
            renderList({
                skills: [
                    makeSkill('zeta', 'demo-builder'),
                    makeSkill('alpha', 'demo-builder'),
                    makeSkill('beta', 'demo-builder'),
                ],
            });

            fireEvent.click(screen.getByTestId('ai-skills-group-demo-builder'));

            const rows = screen.getAllByTestId('ai-skill-row').map(r => r.textContent);
            expect(rows).toEqual(['alpha', 'beta', 'zeta']);
        });

        it('hides skill names when the group is clicked again', () => {
            renderList({ skills: [makeSkill('add-component', 'demo-builder')] });

            const groupToggle = screen.getByTestId('ai-skills-group-demo-builder');
            fireEvent.click(groupToggle);
            expect(screen.getByText('add-component')).toBeInTheDocument();

            fireEvent.click(groupToggle);
            expect(screen.queryByText('add-component')).not.toBeInTheDocument();
        });

        it('expands groups independently', () => {
            renderList({
                skills: [
                    makeSkill('add-component', 'demo-builder'),
                    makeSkill('aem-tester', 'adobe'),
                ],
            });

            fireEvent.click(screen.getByTestId('ai-skills-group-demo-builder'));
            expect(screen.getByText('add-component')).toBeInTheDocument();
            expect(screen.queryByText('aem-tester')).not.toBeInTheDocument();

            fireEvent.click(screen.getByTestId('ai-skills-group-adobe'));
            expect(screen.getByText('add-component')).toBeInTheDocument();
            expect(screen.getByText('aem-tester')).toBeInTheDocument();
        });
    });

    describe('Empty / error states', () => {
        it('shows a plain-language empty state when there are no skills', () => {
            renderList({ skills: [] });
            expect(screen.getByTestId('ai-skills-empty')).toBeInTheDocument();
        });

        it('shows an error row when the inspector errored', () => {
            renderList({ skills: [], hasError: true });
            expect(screen.getByTestId('ai-skills-error')).toBeInTheDocument();
        });
    });
});
