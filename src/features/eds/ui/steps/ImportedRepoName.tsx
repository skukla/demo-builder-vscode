/**
 * ImportedRepoName
 *
 * The Storefront area's repository step for a project imported from a demo bundle (EDS-72):
 * the project's own new repository, made from the bundle's files when the storefront is set
 * up. So there is no list to pick from and no Create button, which would generate a repository
 * from the brand's template and quietly put the brand's code where the imported code belongs.
 * Only the name, and where it will be created.
 *
 * @module features/eds/ui/steps/ImportedRepoName
 */

import { Heading, TextField, View } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import { edsConfigStringDefaults } from '../helpers/edsConfigDefaults';
import { getValidationState } from '@/core/ui/utils/validationState';
import { getRepositoryNameError, normalizeRepositoryName } from '@/core/validation/normalizers';
import type { BaseStepProps } from '@/types/wizard';

export interface ImportedRepoNameProps extends Pick<BaseStepProps, 'state' | 'updateState'> {
    /** Reports whether the repository choice is valid: a usable name. */
    onRepoValidChange: (valid: boolean) => void;
}

export function ImportedRepoName({
    state,
    updateState,
    onRepoValidChange,
}: ImportedRepoNameProps): React.ReactElement {
    const edsConfig = state.edsConfig;
    const repoName = edsConfig?.repoName ?? '';
    const [typed, setTyped] = useState<string>();

    const write = useCallback(
        (updates: Partial<NonNullable<typeof edsConfig>>) =>
            updateState({
                edsConfig: { ...edsConfig, ...edsConfigStringDefaults(edsConfig), ...updates },
            }),
        [edsConfig, updateState],
    );

    // A new repository, named after the project as typed; never one picked or made before.
    const isNew = edsConfig?.repoMode === 'new' && Boolean(repoName);
    const suggested = normalizeRepositoryName(state.projectTitle ?? state.projectName ?? '');
    useEffect(() => {
        if (isNew) return;
        write({
            repoMode: 'new',
            repoName: repoName || suggested,
            daLiveSite: repoName || suggested,
            selectedRepo: undefined,
            existingRepo: undefined,
            createdRepo: undefined,
            resetToTemplate: false,
        });
    }, [isNew, repoName, suggested, write]);

    const error = getRepositoryNameError(repoName);
    useEffect(() => onRepoValidChange(!error), [error, onRepoValidChange]);

    const handleChange = (value: string): void => {
        setTyped(value);
        const name = normalizeRepositoryName(value);
        // The DA.live site name follows the repository name.
        write({ repoName: name, daLiveSite: name });
    };

    const owner = edsConfig?.daLiveOrg || edsConfig?.githubAuth?.user?.login || 'your account';
    const demoName = state.importedFrom?.bundleName ?? 'the imported demo';
    return (
        <View backgroundColor="gray-50" borderRadius="medium" padding="size-300">
            <Heading level={3} margin={0} marginBottom="size-200">
                New Repository
            </Heading>
            <TextField
                label="Repository Name"
                value={typed ?? repoName}
                onChange={handleChange}
                validationState={getValidationState(repoName ? error : undefined, !error)}
                errorMessage={repoName ? error : undefined}
                placeholder="my-eds-project"
                description={`Will be created as ${owner}/${repoName || 'my-eds-project'} from ${demoName} when the storefront is set up`}
                width="100%"
                isRequired
            />
        </View>
    );
}
