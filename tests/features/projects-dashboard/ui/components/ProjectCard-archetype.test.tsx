/**
 * @jest-environment jsdom
 *
 * ProjectCard — content (joined/satellite) archetype badge (Step 7).
 *
 * A content-flow project (repoless satellite) is visually marked as "Shared"
 * with its upstream, so it's distinguishable from a commerce storefront on the
 * home grid. Commerce projects are unchanged.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ProjectCard } from '@/features/projects-dashboard/ui/components/ProjectCard';
import { createMockProject } from '../../testUtils';

const renderCard = (project = createMockProject()) =>
    render(
        <Provider theme={defaultTheme} colorScheme="light">
            <ProjectCard project={project} onSelect={jest.fn()} />
        </Provider>,
    );

const contentProject = createMockProject({
    name: 'My Joined Site',
    flow: 'content',
    upstream: { owner: 'commerce-sc', repo: 'citisignal-upstream' },
    selectedStack: 'eds-accs',
});

describe('ProjectCard — content (joined) archetype', () => {
    it('shows a "Shared" badge naming the upstream for a content-flow project', () => {
        renderCard(contentProject);
        expect(screen.getByTestId('project-card-shared-badge')).toBeInTheDocument();
        expect(screen.getByText(/commerce-sc\/citisignal-upstream/)).toBeInTheDocument();
    });

    it('does NOT show the shared badge for a commerce project', () => {
        renderCard(createMockProject({ name: 'My Commerce Site', selectedStack: 'eds-accs' }));
        expect(screen.queryByTestId('project-card-shared-badge')).not.toBeInTheDocument();
    });
});
