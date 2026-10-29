/**
 * DefaultBranchNotice — the warning for a repository whose default branch is not
 * `main`. Shown only when the branch is KNOWN and different: an older cached
 * repo list carries no `defaultBranch`, and absence is not a fault.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';
import { TestWrapper } from '../components/DaLiveServiceCard.testUtils';
import { DefaultBranchNotice } from '@/features/eds/ui/steps/DefaultBranchNotice';
import type { GitHubRepoItem } from '@/types/webview';

function repoOn(defaultBranch?: string): GitHubRepoItem {
    return {
        id: 'skukla/kukla-bodea',
        name: 'kukla-bodea',
        fullName: 'skukla/kukla-bodea',
        htmlUrl: 'https://github.com/skukla/kukla-bodea',
        defaultBranch,
    };
}

function renderNotice(selectedRepo?: GitHubRepoItem) {
    return render(
        <TestWrapper>
            <DefaultBranchNotice selectedRepo={selectedRepo} />
        </TestWrapper>,
    );
}

describe('DefaultBranchNotice', () => {
    it('names the repository and the branch it defaults to', () => {
        renderNotice(repoOn('master'));

        const notice = screen.getByTestId('default-branch-notice');
        expect(notice).toHaveTextContent('This repository uses a different default branch');
        expect(notice).toHaveTextContent(
            'Demo Builder builds storefronts from main, and skukla/kukla-bodea defaults to master.',
        );
    });

    it('says nothing for a repository on main', () => {
        renderNotice(repoOn('main'));

        expect(screen.queryByTestId('default-branch-notice')).not.toBeInTheDocument();
    });

    it('says nothing when the branch is unknown', () => {
        renderNotice(repoOn(undefined));

        expect(screen.queryByTestId('default-branch-notice')).not.toBeInTheDocument();
    });

    it('says nothing when no repository is selected', () => {
        renderNotice(undefined);

        expect(screen.queryByTestId('default-branch-notice')).not.toBeInTheDocument();
    });
});
