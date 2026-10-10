/**
 * NewRepoForm
 *
 * The create-a-repository form inside the Storefront area's repository picker:
 * the name field, the line beneath it saying where the repository will live (or
 * now does), Browse back to the list, and Create. The picker
 * (`RepoSelectionInline`) owns the state; this only draws it.
 *
 * @module features/eds/ui/steps/NewRepoForm
 */

import { Button, Flex, Heading, TextField, View } from '@adobe/react-spectrum';
import React from 'react';
import type { RepoCreationState } from './repoSelectionInline.helpers';
import { LoadingOverlay } from '@/core/ui/components/feedback/LoadingOverlay';
import { getValidationState } from '@/core/ui/utils/validationState';
import { isValidRepositoryName } from '@/core/validation/normalizers';

/**
 * The line under the name field: where the repo WILL live, or where it now DOES.
 *
 * Tense is the whole point. "Will be created as …" stayed on screen after the repo
 * existed, which is the same class of mistake as an empty field that is actually
 * satisfied — the UI describing an intention rather than the state.
 */
function describeRepoTarget(
    repoName: string,
    repoCreationState: RepoCreationState,
    githubUser?: { login: string },
): string {
    if (!githubUser) return 'Name for your new GitHub repository';

    const target = `${githubUser.login}/${repoName || 'my-eds-project'}`;
    return repoCreationState.isCreated && !repoCreationState.isCreating
        ? `Created as ${target}`
        : `Will be created as ${target}`;
}

/**
 * NewRepoForm - Form for creating a new repository.
 */
export function NewRepoForm({
    repoName,
    repoNameInput,
    githubUser,
    repoNameError,
    repoCreationState,
    templateAvailable,
    onRepoNameChange,
    onRepoNameBlur,
    onUseExisting,
    onCreateRepository,
}: {
    /** The GitHub name, derived from what was typed. */
    repoName: string;
    /** What the SC typed; defaults to `repoName`. */
    repoNameInput?: string;
    githubUser?: { login: string };
    repoNameError?: string;
    repoCreationState: RepoCreationState;
    templateAvailable: boolean;
    onRepoNameChange: (value: string) => void;
    onRepoNameBlur: () => void;
    onUseExisting: () => void;
    onCreateRepository: () => void;
}): React.ReactElement {
    return (
        <View backgroundColor="gray-50" borderRadius="medium" padding="size-300">
            <Heading level={3} margin={0} marginBottom="size-200">
                Create New Repository
            </Heading>

            <TextField
                label="Repository Name"
                value={repoNameInput ?? repoName}
                onChange={onRepoNameChange}
                onBlur={onRepoNameBlur}
                // The field that did the work says so. Creation left it grey and
                // disabled with helper text still in the future tense, so the only
                // confirmation was a tick in the summary panel across the screen.
                // `valid` is what draws Spectrum's checkmark, the same mark the
                // project-name field earns.
                validationState={getValidationState(
                    repoNameError || repoCreationState.error,
                    repoCreationState.isCreated && !repoCreationState.isCreating,
                )}
                errorMessage={repoNameError || repoCreationState.error}
                placeholder="my-eds-project"
                description={describeRepoTarget(repoName, repoCreationState, githubUser)}
                width="100%"
                isRequired
                autoFocus
                // READ-only once created, not DISABLED. Both stop editing, but a
                // disabled Spectrum field suppresses the validation icon — so the
                // checkmark this field earns on success was drawn and then hidden.
                // Still disabled while the request is in flight: there is nothing to
                // report yet, and greying it is the honest signal that it is busy.
                isReadOnly={repoCreationState.isCreated}
                isDisabled={repoCreationState.isCreating}
            />

            <Flex justifyContent="end" gap="size-100" marginTop="size-200">
                <Button variant="secondary" onPress={onUseExisting}>
                    Browse
                </Button>
                {!repoCreationState.isCreated && (
                    <Button
                        variant="accent"
                        onPress={onCreateRepository}
                        isDisabled={
                            !repoName ||
                            !isValidRepositoryName(repoName) ||
                            repoCreationState.isCreating ||
                            !templateAvailable
                        }
                    >
                        Create
                    </Button>
                )}
            </Flex>

            <LoadingOverlay isVisible={repoCreationState.isCreating} />
        </View>
    );
}
