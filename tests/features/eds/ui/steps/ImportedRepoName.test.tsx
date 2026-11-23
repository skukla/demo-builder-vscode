/**
 * The Storefront area's repository step for a project imported from a demo bundle (EDS-72):
 * the repository is the project's own and new, made from the bundle when setup runs. So there is
 * no list to pick from and no Create button (which would generate one from the brand's template,
 * silently replacing the imported code): a name, valid or not, and where it will be created.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { ImportedRepoName } from '@/features/eds/ui/steps/ImportedRepoName';
import type { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';

const IMPORTED = { bundleName: 'Bodea Summit', bundlePath: '/x/bodea-demo-bundle.zip' };

function stateWith(edsConfig: Partial<NonNullable<WizardState['edsConfig']>> = {}): WizardState {
    return {
        currentStep: 'build-your-project',
        projectName: 'bodea-summit',
        projectTitle: 'Bodea Summit',
        importedFrom: IMPORTED,
        edsConfig: {
            accsHost: '',
            storeViewCode: '',
            customerGroup: '',
            repoName: '',
            daLiveOrg: 'acme',
            daLiveSite: '',
            templateOwner: 'demo-system-stores',
            templateRepo: 'accs-bodea',
            ...edsConfig,
        },
    } as WizardState;
}

describe('ImportedRepoName', () => {
    it('starts a new repository named after the project, with no repository chosen or created', () => {
        const updateState = jest.fn();
        render(
            <ImportedRepoName
                state={stateWith({
                    repoMode: 'existing',
                    existingRepo: 'acme/old',
                    createdRepo: { owner: 'acme', name: 'old', url: 'u', fullName: 'acme/old' },
                })}
                updateState={updateState}
                onRepoValidChange={jest.fn()}
            />
        );

        expect(updateState).toHaveBeenCalledWith({
            edsConfig: expect.objectContaining({
                repoMode: 'new',
                repoName: 'bodea-summit',
                daLiveSite: 'bodea-summit',
                existingRepo: undefined,
                selectedRepo: undefined,
                createdRepo: undefined,
                resetToTemplate: false,
                templateRepo: 'accs-bodea',
            }),
        });
    });

    it('says where it will be created, and that it comes from the imported demo, with no Create button', () => {
        render(
            <ImportedRepoName
                state={stateWith({ repoMode: 'new', repoName: 'bodea-summit' })}
                updateState={jest.fn()}
                onRepoValidChange={jest.fn()}
            />
        );

        expect(
            screen.getByText(
                'Will be created as acme/bodea-summit from Bodea Summit when the storefront is set up'
            )
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Create' })).not.toBeInTheDocument();
    });

    it('reports a valid name as a valid choice, and a bad one as not', () => {
        const onRepoValidChange = jest.fn();
        const { rerender } = render(
            <ImportedRepoName
                state={stateWith({ repoMode: 'new', repoName: 'bodea-summit' })}
                updateState={jest.fn()}
                onRepoValidChange={onRepoValidChange}
            />
        );
        expect(onRepoValidChange).toHaveBeenLastCalledWith(true);

        rerender(
            <ImportedRepoName
                state={stateWith({ repoMode: 'new', repoName: '' })}
                updateState={jest.fn()}
                onRepoValidChange={onRepoValidChange}
            />
        );
        expect(onRepoValidChange).toHaveBeenLastCalledWith(false);
    });

    it('writes what is typed as the repository and site name, normalised', () => {
        const updateState = jest.fn();
        render(
            <ImportedRepoName
                state={stateWith({ repoMode: 'new', repoName: 'bodea-summit' })}
                updateState={updateState}
                onRepoValidChange={jest.fn()}
            />
        );

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My Bodea' } });

        expect(updateState).toHaveBeenLastCalledWith({
            edsConfig: expect.objectContaining({ repoName: 'my-bodea', daLiveSite: 'my-bodea' }),
        });
    });
});
