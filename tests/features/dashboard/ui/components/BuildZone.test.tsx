/**
 * The Build zone: what the demo contains (Edit, Configure, Datapacks, AEM
 * Assets), then Reset and Delete set apart at the foot.
 *
 * Split out of ActionGrid on 2026-10-09 (EDS-8). The ActionGrid suites still
 * pin where the zone sits among its siblings; this one pins the zone itself —
 * order, gating, the Edit tile's two tooltips, and which tile is destructive.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@adobe/react-spectrum', () => {
    const { domProps } = jest.requireActual('../../../../helpers/spectrumStubProps');
    return {
        ActionButton: ({
            children,
            onPress,
            isDisabled,
            UNSAFE_className,
            ...props
        }: {
            children?: React.ReactNode;
            onPress?: () => void;
            isDisabled?: boolean;
            UNSAFE_className?: string;
        } & Record<string, unknown>) => (
            <button
                onClick={onPress}
                disabled={isDisabled}
                className={UNSAFE_className}
                {...domProps(props)}
            >
                {children}
            </button>
        ),
        Text: ({
            children,
            UNSAFE_className,
        }: {
            children: React.ReactNode;
            UNSAFE_className?: string;
        }) => <span className={UNSAFE_className}>{children}</span>,
        TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        Tooltip: ({ children }: { children: React.ReactNode }) => (
            <span role="tooltip">{children}</span>
        ),
    };
});

// Below the mock on purpose — see webview-test-authoring §3.
import { BuildZone } from '@/features/dashboard/ui/components/BuildZone';

type BuildZoneProps = React.ComponentProps<typeof BuildZone>;

function props(overrides: Partial<BuildZoneProps> = {}): BuildZoneProps {
    return {
        canEdit: true,
        isMeshActionDisabled: false,
        dataInstallerAvailable: true,
        handleEditProject: jest.fn(),
        handleConfigure: jest.fn(),
        handleOpenAemAssets: jest.fn(),
        handleResetProject: jest.fn(),
        handleDeleteProject: jest.fn(),
        ...overrides,
    };
}

const buttonFor = (label: string): HTMLElement => {
    const button = screen.getByText(label).closest('button');
    if (!button) throw new Error(`no button for ${label}`);
    return button;
};

/** The tooltip rendered beside a tile — the stub renders it as the button's next sibling. */
const tooltipFor = (label: string): string | null =>
    buttonFor(label).nextElementSibling?.textContent ?? null;

describe('BuildZone', () => {
    it('is the compact zone headed Build', () => {
        const { container } = render(<BuildZone {...props()} />);

        const zone = container.querySelector('[data-zone="build"]');
        expect(zone).toHaveAttribute('aria-label', 'Build');
        expect(zone).toHaveClass('dashboard-zone-section--compact');
        expect(screen.getByRole('heading', { name: 'Build' })).toBeInTheDocument();
    });

    it('lists what the demo contains first, then Reset and Delete', () => {
        render(<BuildZone {...props()} />);

        const labels = screen
            .getAllByRole('button')
            .map((b) => b.querySelector('.icon-label')?.textContent);
        expect(labels).toStrictEqual([
            'Edit',
            'Configure',
            'Datapacks',
            'AEM Assets',
            'Reset',
            'Delete',
        ]);
    });

    describe('Edit', () => {
        it('is absent when the host wired no edit handler', () => {
            render(<BuildZone {...props({ handleEditProject: undefined })} />);

            expect(screen.queryByText('Edit')).not.toBeInTheDocument();
        });

        it('says what it changes while editing is allowed', () => {
            render(<BuildZone {...props()} />);

            expect(buttonFor('Edit')).toBeEnabled();
            expect(tooltipFor('Edit')).toBe(
                'Change the demo’s brand, stack, components or block libraries'
            );
        });

        it('is disabled, not hidden, and says why when editing is not allowed', () => {
            render(<BuildZone {...props({ canEdit: false })} />);

            expect(buttonFor('Edit')).toBeDisabled();
            expect(buttonFor('Edit')).toHaveAttribute('data-action', 'edit');
            expect(tooltipFor('Edit')).toBe('Stop the demo to change what it contains');
        });

        it('opens the editor when pressed', () => {
            const handleEditProject = jest.fn();
            render(<BuildZone {...props({ handleEditProject })} />);

            fireEvent.click(buttonFor('Edit'));

            expect(handleEditProject).toHaveBeenCalledTimes(1);
        });
    });

    describe('Configure', () => {
        it('runs its handler when pressed', () => {
            const handleConfigure = jest.fn();
            render(<BuildZone {...props({ handleConfigure })} />);

            fireEvent.click(buttonFor('Configure'));

            expect(handleConfigure).toHaveBeenCalledTimes(1);
        });

        it('is disabled while mesh actions are', () => {
            render(<BuildZone {...props({ isMeshActionDisabled: true })} />);

            expect(buttonFor('Configure')).toBeDisabled();
        });
    });

    describe('Datapacks', () => {
        it('is offered only when the host says the Data Installer is set up', () => {
            render(<BuildZone {...props({ dataInstallerAvailable: false })} />);

            expect(screen.queryByText('Datapacks')).not.toBeInTheDocument();
        });

        it('is hidden when the host did not say', () => {
            render(<BuildZone {...props({ dataInstallerAvailable: undefined })} />);

            expect(screen.queryByText('Datapacks')).not.toBeInTheDocument();
        });
    });

    it('opens AEM Assets, and says where it goes', () => {
        const handleOpenAemAssets = jest.fn();
        render(<BuildZone {...props({ handleOpenAemAssets })} />);

        fireEvent.click(buttonFor('AEM Assets'));

        expect(handleOpenAemAssets).toHaveBeenCalledTimes(1);
        expect(tooltipFor('AEM Assets')).toBe(
            'Open the AEM environment your storefronts use for images and assets'
        );
    });

    describe('Reset and Delete', () => {
        it('sit together, apart from the everyday tiles', () => {
            const { container } = render(<BuildZone {...props()} />);

            const group = container.querySelector('.dashboard-compact-danger');
            const actions = Array.from(group?.querySelectorAll('[data-action]') ?? []).map((el) =>
                el.getAttribute('data-action')
            );
            expect(actions).toStrictEqual(['reset', 'delete']);
        });

        it('marks Delete, and only Delete, as destructive', () => {
            render(<BuildZone {...props()} />);

            expect(buttonFor('Delete')).toHaveClass('dashboard-action-button--danger');
            expect(buttonFor('Reset')).not.toHaveClass('dashboard-action-button--danger');
        });

        it('say what each one does', () => {
            render(<BuildZone {...props()} />);

            expect(tooltipFor('Reset')).toBe('Put the demo back to how it was first set up');
            expect(tooltipFor('Delete')).toBe('Delete this project and what it created');
        });

        it('run their own handlers', () => {
            const handleResetProject = jest.fn();
            const handleDeleteProject = jest.fn();
            render(<BuildZone {...props({ handleResetProject, handleDeleteProject })} />);

            fireEvent.click(buttonFor('Reset'));
            expect(handleResetProject).toHaveBeenCalledTimes(1);
            expect(handleDeleteProject).not.toHaveBeenCalled();

            fireEvent.click(buttonFor('Delete'));
            expect(handleDeleteProject).toHaveBeenCalledTimes(1);
        });
    });
});
