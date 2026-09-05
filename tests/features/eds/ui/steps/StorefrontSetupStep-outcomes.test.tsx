/**
 * StorefrontSetupStep — the three terminal pushes: complete, error, and
 * github-app-required.
 *
 * Each one decides what the SC is told and what the wizard is handed. Two of
 * those decisions have been wrong in shipped builds: a storefront that could
 * not serve a single product page wore the same green checkmark as a healthy
 * one (the completion payload's `warnings` were sent for months and rendered
 * nowhere), and "install detected" used to advance the wizard as though setup
 * could resume when it cannot.
 */

import {
    COMPLETE_EDS_CONFIG,
    cancelPayloads,
    pushComplete,
    pushError,
    pushGitHubAppRequired,
    pushProgress,
    renderStep,
    resetDriver,
} from './StorefrontSetupStep.driver.testUtils';
import { fireEvent, screen } from '@testing-library/react';

beforeEach(() => {
    resetDriver();
});

const GITHUB_APP_PAYLOAD = {
    owner: 'test-org',
    repo: 'test-repo',
    installUrl: 'https://github.com/apps/aem-code-sync/installations/new',
    message: 'AEM Code Sync is not installed on this repository.',
    siteUnregistered: true,
};

describe('StorefrontSetupStep — completion', () => {
    it('unblocks Continue, drops the loader and reports a clean publish', () => {
        const { setCanProceed } = renderStep();

        pushComplete({ message: 'Storefront setup completed successfully!' });

        expect(setCanProceed).toHaveBeenCalledWith(true);
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
        expect(screen.getByText('Storefront Published')).toBeInTheDocument();
    });

    it('hands the wizard the repo URL and the preflight-complete flag', () => {
        const { updateState } = renderStep();

        pushComplete({
            message: 'Storefront setup completed successfully!',
            githubRepo: 'https://github.com/test-org/test-repo',
        });

        expect(updateState).toHaveBeenCalledWith({
            edsConfig: {
                ...COMPLETE_EDS_CONFIG,
                repoUrl: 'https://github.com/test-org/test-repo',
                preflightComplete: true,
            },
        });
    });

    it('calls the updateState the wizard holds now, not the one it mounted with', () => {
        const mounted = jest.fn();
        const current = jest.fn();
        const { rerenderWith } = renderStep({ updateState: mounted });

        rerenderWith({ updateState: current });
        pushComplete({ message: 'Storefront setup completed successfully!' });

        expect(current).toHaveBeenCalledTimes(1);
        expect(mounted).not.toHaveBeenCalled();
    });

    it('marks the repo and the content as created for any later cleanup', () => {
        const { unmount } = renderStep();

        pushProgress({
            phase: 'repository',
            message: 'Creating repository...',
            progress: 10,
            repoUrl: 'https://github.com/test-org/test-repo',
            repoOwner: 'test-org',
            repoName: 'test-repo',
        });
        pushComplete({ message: 'Storefront setup completed successfully!' });
        // 'completed' is not an active phase, so a later active push is what
        // makes the recorded state observable through the cancel request.
        pushProgress({ phase: 'publish', message: 'Publishing...', progress: 70 });
        unmount();

        expect(cancelPayloads().at(-1)?.partialState).toEqual({
            repoCreated: true,
            repoUrl: 'https://github.com/test-org/test-repo',
            repoOwner: 'test-org',
            repoName: 'test-repo',
            contentCopied: true,
            phase: 'publish',
        });
    });

    it('does not dress a degraded storefront as a clean one', () => {
        renderStep();

        pushComplete({
            message: 'Storefront setup completed successfully!',
            warnings: [
                'Product detail pages will not render: the catalog has no matching SKUs.',
                'Block library publish was skipped.',
            ],
        });

        expect(screen.getByText('Storefront Published, with warnings')).toBeInTheDocument();
        expect(screen.queryByText('Storefront Published')).not.toBeInTheDocument();
        expect(
            screen.getByText(
                'Product detail pages will not render: the catalog has no matching SKUs.',
            ),
        ).toBeInTheDocument();
        expect(screen.getByText('Block library publish was skipped.')).toBeInTheDocument();
    });
});

describe('StorefrontSetupStep — failure', () => {
    it('shows the failure detail and stops the loader', () => {
        const { setCanProceed } = renderStep();

        pushError({ message: 'Pipeline stopped', error: 'DA.live returned 403 on /content' });

        expect(screen.getByText('Storefront Setup Failed')).toBeInTheDocument();
        expect(screen.getByText('DA.live returned 403 on /content')).toBeInTheDocument();
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
        expect(setCanProceed).not.toHaveBeenCalledWith(true);
    });

    it('falls back to the failure message when no detail came with it', () => {
        renderStep();

        pushError({ message: 'Pipeline stopped', error: '' });

        expect(screen.getByText('Pipeline stopped')).toBeInTheDocument();
    });

    it('says something when the push carried neither a message nor a detail', () => {
        renderStep();

        pushError({ message: '', error: '' });

        expect(screen.getByText('An error occurred')).toBeInTheDocument();
    });
});

describe('StorefrontSetupStep — GitHub App installation required', () => {
    it('forwards every field of the payload to the install dialog', () => {
        renderStep();

        pushGitHubAppRequired(GITHUB_APP_PAYLOAD);

        const dialog = screen.getByTestId('github-app-dialog');
        expect(dialog).toHaveAttribute('data-owner', 'test-org');
        expect(dialog).toHaveAttribute('data-repo', 'test-repo');
        expect(dialog).toHaveAttribute(
            'data-install-url',
            'https://github.com/apps/aem-code-sync/installations/new',
        );
        expect(dialog).toHaveAttribute(
            'data-message',
            'AEM Code Sync is not installed on this repository.',
        );
        expect(dialog).toHaveAttribute('data-site-unregistered', 'true');
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
    });

    it('takes the dialog down once the pipeline moves on, payload or not', () => {
        renderStep();
        pushGitHubAppRequired(GITHUB_APP_PAYLOAD);

        pushProgress({ phase: 'publish', message: 'Publishing...', progress: 70 });

        expect(screen.queryByTestId('github-app-dialog')).not.toBeInTheDocument();
        expect(screen.getByTestId('loading')).toBeInTheDocument();
    });

    it('lands on a truthful stopped state when the install is detected', () => {
        renderStep();
        pushGitHubAppRequired(GITHUB_APP_PAYLOAD);

        fireEvent.click(screen.getByText('Simulate install detected'));

        expect(screen.getByText('Storefront Setup Failed')).toBeInTheDocument();
        expect(
            screen.getByText(
                'AEM Code Sync is now installed. Setup stopped before it could use it — ' +
                    'select Retry to run it again.',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByTestId('github-app-dialog')).not.toBeInTheDocument();
    });
});
