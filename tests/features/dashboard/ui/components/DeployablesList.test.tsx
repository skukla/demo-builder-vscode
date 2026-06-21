/**
 * DeployablesList Component Tests (D2 Track B — Step 05)
 *
 * The separate "integrations" surface on the dashboard. Renders one
 * DeployableRow per kind:'integration' entry in the project (the mesh keeps its
 * own badge and is EXCLUDED here). Exposes an "Add a deployable" affordance that
 * opens the stack-filtered catalog picker plus a custom GitHub-URL door; a
 * catalog choice posts addDeployable {id}, a custom URL posts addDeployable
 * {source:{owner,repo}}.
 *
 * Strict TDD: written BEFORE the component exists.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeployablesList } from '@/features/dashboard/ui/components/DeployablesList';
import type { Project } from '@/types';
import type { DeployableCatalogEntry } from '@/types/deployables';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(() => jest.fn()),
        request: jest.fn(() => new Promise(() => {})),
    },
}));

jest.mock('@adobe/react-spectrum', () => ({
    View: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Flex: ({ children, ...props }: any) => <div style={{ display: 'flex' }} {...props}>{children}</div>,
    Heading: ({ children, ...props }: any) => <h3 {...props}>{children}</h3>,
    Button: ({ children, onPress, isDisabled, variant, ...props }: any) => (
        <button onClick={onPress} disabled={isDisabled} data-variant={variant} {...props}>{children}</button>
    ),
    TextField: ({ label, value, onChange, ...props }: any) => (
        <input aria-label={label} value={value ?? ''} onChange={(e) => onChange?.(e.target.value)} {...props} />
    ),
    Link: ({ children, onPress, href, ...props }: any) => (
        <a onClick={onPress} href={href} {...props}>{children}</a>
    ),
    ProgressCircle: ({ ...props }: any) => <div data-testid="progress-circle" {...props} />,
    Text: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    DialogContainer: ({ children }: any) => <div data-testid="dialog-container">{children}</div>,
}));

jest.mock('@/core/ui/components/ui/Modal', () => ({
    Modal: ({ title, actionButtons = [], onClose, children }: any) => (
        <div role="dialog" aria-label={title}>
            <h2>{title}</h2>
            {children}
            <button onClick={onClose}>Close</button>
            {actionButtons.map((b: any, i: number) => (
                <button key={i} onClick={b.onPress} data-variant={b.variant} disabled={b.isDisabled}>
                    {b.label}
                </button>
            ))}
        </div>
    ),
}));

jest.mock('@/core/ui/components/feedback', () => ({
    StatusCard: ({ label, status, color, action }: any) => (
        <div data-testid={`status-card-${label}`} data-color={color}>
            {label}: {status}
            {action && <a data-testid={action.testId} onClick={action.onPress}>{action.label}</a>}
        </div>
    ),
}));

function getClient() {
    const { webviewClient } = require('@/core/ui/utils/WebviewClient');
    return webviewClient as { postMessage: jest.Mock };
}

const CATALOG: DeployableCatalogEntry[] = [
    {
        id: 'erp-sync',
        name: 'ERP Sync',
        description: 'Sync ERP data',
        kind: 'integration',
        source: { owner: 'acme', repo: 'erp-sync' },
    },
    {
        id: 'commerce-paas-mesh',
        name: 'API Mesh',
        description: 'Commerce mesh',
        kind: 'mesh',
        source: { owner: 'acme', repo: 'mesh' },
    },
];

function projectWith(deployables: Project['deployables']): Project {
    return {
        name: 'demo',
        path: '/p',
        deployables,
    } as unknown as Project;
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('DeployablesList', () => {
    it('renders one row per integration and EXCLUDES the mesh', () => {
        const project = projectWith({
            'erp-sync': { kind: 'integration', status: 'deployed', source: { owner: 'acme', repo: 'erp-sync' } },
            'commerce-paas-mesh': { kind: 'mesh', status: 'deployed', source: { owner: 'acme', repo: 'mesh' }, endpoint: 'https://m' },
        });

        render(<DeployablesList project={project} catalog={CATALOG} />);

        // The integration row surfaces a Redeploy (deployed integration) …
        expect(screen.getByRole('button', { name: /redeploy/i })).toBeInTheDocument();
        // … and the mesh is NOT rendered as a row (no second Redeploy / no API Mesh row).
        expect(screen.getAllByRole('button', { name: /redeploy/i })).toHaveLength(1);
    });

    it('shows an empty-state Add prompt when there are no integrations', () => {
        const project = projectWith({
            'commerce-paas-mesh': { kind: 'mesh', status: 'deployed', source: { owner: 'acme', repo: 'mesh' }, endpoint: 'https://m' },
        });

        render(<DeployablesList project={project} catalog={CATALOG} />);

        expect(screen.getByRole('button', { name: /add a deployable/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /redeploy/i })).not.toBeInTheDocument();
    });

    describe('remove confirmation guard', () => {
        function deployedProject(): Project {
            return projectWith({
                'erp-sync': { kind: 'integration', status: 'deployed', source: { owner: 'acme', repo: 'erp-sync' } },
            });
        }

        it('opens a confirm dialog on Remove WITHOUT posting removeDeployable directly', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<DeployablesList project={deployedProject()} catalog={CATALOG} />);

            await user.click(screen.getByRole('button', { name: /^remove$/i }));

            // The dialog is now open …
            expect(screen.getByRole('dialog')).toBeInTheDocument();
            // … and NOTHING was torn down yet.
            expect(getClient().postMessage).not.toHaveBeenCalledWith('removeDeployable', expect.anything());
        });

        it('posts removeDeployable with the row id when the dialog is confirmed', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<DeployablesList project={deployedProject()} catalog={CATALOG} />);

            await user.click(screen.getByRole('button', { name: /^remove$/i }));
            // The dialog's destructive confirm is also labelled "Remove" — scope to the dialog.
            const dialog = screen.getByRole('dialog');
            await user.click(within(dialog).getByRole('button', { name: /^remove$/i }));

            expect(getClient().postMessage).toHaveBeenCalledWith('removeDeployable', { id: 'erp-sync' });
        });

        it('SAFETY: cancelling the dialog never posts removeDeployable', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<DeployablesList project={deployedProject()} catalog={CATALOG} />);

            await user.click(screen.getByRole('button', { name: /^remove$/i }));
            const dialog = screen.getByRole('dialog');
            await user.click(within(dialog).getByRole('button', { name: /close/i }));

            expect(getClient().postMessage).not.toHaveBeenCalledWith('removeDeployable', expect.anything());
        });
    });

    describe('add-a-deployable picker', () => {
        it('opens the catalog picker showing only integration entries (mesh excluded)', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<DeployablesList project={projectWith({})} catalog={CATALOG} />);

            await user.click(screen.getByRole('button', { name: /add a deployable/i }));

            expect(screen.getByText('ERP Sync')).toBeInTheDocument();
            expect(screen.queryByText('API Mesh')).not.toBeInTheDocument();
        });

        it('posts addDeployable with the chosen catalog id', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<DeployablesList project={projectWith({})} catalog={CATALOG} />);

            await user.click(screen.getByRole('button', { name: /add a deployable/i }));
            await user.click(screen.getByRole('button', { name: /ERP Sync/i }));

            expect(getClient().postMessage).toHaveBeenCalledWith('addDeployable', { id: 'erp-sync' });
        });

        it('posts addDeployable with a parsed custom source when a GitHub URL is entered', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<DeployablesList project={projectWith({})} catalog={CATALOG} />);

            await user.click(screen.getByRole('button', { name: /add a deployable/i }));
            const input = screen.getByLabelText(/github.*url|custom.*url/i);
            await user.type(input, 'https://github.com/owner/custom-app');
            await user.click(screen.getByRole('button', { name: /^add$/i }));

            expect(getClient().postMessage).toHaveBeenCalledWith('addDeployable', {
                source: { owner: 'owner', repo: 'custom-app' },
            });
        });

        it('disables the custom Add button until a valid GitHub URL is entered', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<DeployablesList project={projectWith({})} catalog={CATALOG} />);

            await user.click(screen.getByRole('button', { name: /add a deployable/i }));
            expect(screen.getByRole('button', { name: /^add$/i })).toBeDisabled();

            const input = screen.getByLabelText(/github.*url|custom.*url/i);
            await user.type(input, 'not-a-url');
            expect(screen.getByRole('button', { name: /^add$/i })).toBeDisabled();
        });
    });
});
