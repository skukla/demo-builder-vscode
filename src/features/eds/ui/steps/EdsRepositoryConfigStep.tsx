/**
 * EdsRepositoryConfigStep
 *
 * Configuration step for EDS repository and DA.live settings.
 * Separated from authentication for cleaner UX.
 *
 * Features:
 * - Create new or use existing repository
 * - Repository name/selection with validation
 * - DA.live organization with verification
 * - DA.live site name
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
    Heading,
    Text,
    TextField,
    Flex,
    ProgressCircle,
    RadioGroup,
    Radio,
    Checkbox,
} from '@adobe/react-spectrum';
import Alert from '@spectrum-icons/workflow/Alert';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import type { BaseStepProps } from '@/types/wizard';

const log = webviewLogger('EdsRepositoryConfigStep');

/** Repository name validation pattern */
const REPO_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/** Existing repo format: owner/repo */
const EXISTING_REPO_PATTERN = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/;

/** DA.live org verification result */
interface DaLiveOrgVerifiedData {
    verified: boolean;
    orgName: string;
    error?: string;
}

/** GitHub repo verification result */
interface GitHubRepoVerifiedData {
    verified: boolean;
    repoFullName: string;
    error?: string;
}

type RepoMode = 'new' | 'existing';

/**
 * EdsRepositoryConfigStep Component
 */
export function EdsRepositoryConfigStep({
    state,
    updateState,
    setCanProceed,
}: BaseStepProps): React.ReactElement {
    const edsConfig = state.edsConfig;
    const [repoNameError, setRepoNameError] = useState<string | undefined>();
    const [existingRepoError, setExistingRepoError] = useState<string | undefined>();
    const [isVerifyingOrg, setIsVerifyingOrg] = useState(false);
    const [isVerifyingRepo, setIsVerifyingRepo] = useState(false);

    // Get current field values
    const repoMode: RepoMode = edsConfig?.repoMode || 'new';
    const repoName = edsConfig?.repoName || '';
    const existingRepo = edsConfig?.existingRepo || '';
    const existingRepoVerified = edsConfig?.existingRepoVerified;
    const resetToTemplate = edsConfig?.resetToTemplate || false;
    const daLiveOrg = edsConfig?.daLiveOrg || '';
    const daLiveSite = edsConfig?.daLiveSite || '';
    const daLiveOrgVerified = edsConfig?.daLiveOrgVerified;
    const daLiveOrgError = edsConfig?.daLiveOrgError;

    /**
     * Update EDS config state
     */
    const updateEdsConfig = useCallback((updates: Partial<typeof edsConfig>) => {
        updateState({
            edsConfig: {
                ...edsConfig,
                accsHost: edsConfig?.accsHost || '',
                storeViewCode: edsConfig?.storeViewCode || '',
                customerGroup: edsConfig?.customerGroup || '',
                repoName: edsConfig?.repoName || '',
                daLiveOrg: edsConfig?.daLiveOrg || '',
                daLiveSite: edsConfig?.daLiveSite || '',
                ...updates,
            },
        });
    }, [edsConfig, updateState]);

    /**
     * Validate repository name format
     */
    const validateRepoName = useCallback((name: string): boolean => {
        if (!name) return false;
        return REPO_NAME_PATTERN.test(name);
    }, []);

    /**
     * Handle repo mode change
     */
    const handleRepoModeChange = useCallback((value: RepoMode) => {
        updateEdsConfig({
            repoMode: value,
            // Clear verification state and reset flag when switching modes
            existingRepoVerified: undefined,
            resetToTemplate: false,
        });
        setExistingRepoError(undefined);
        setRepoNameError(undefined);
    }, [updateEdsConfig]);

    /**
     * Handle reset to template checkbox change
     */
    const handleResetToTemplateChange = useCallback((isSelected: boolean) => {
        updateEdsConfig({ resetToTemplate: isSelected });
    }, [updateEdsConfig]);

    /**
     * Handle repository name change (new repo)
     */
    const handleRepoNameChange = useCallback((value: string) => {
        updateEdsConfig({ repoName: value });

        if (value && !validateRepoName(value)) {
            setRepoNameError('Must start with a letter or number, can contain letters, numbers, dots, hyphens, and underscores');
        } else {
            setRepoNameError(undefined);
        }
    }, [updateEdsConfig, validateRepoName]);

    /**
     * Validate existing repo format (owner/repo)
     */
    const validateExistingRepo = useCallback((value: string): boolean => {
        if (!value) return false;
        return EXISTING_REPO_PATTERN.test(value);
    }, []);

    /**
     * Handle existing repo change
     */
    const handleExistingRepoChange = useCallback((value: string) => {
        updateEdsConfig({
            existingRepo: value,
            existingRepoVerified: undefined,
        });

        if (value && !validateExistingRepo(value)) {
            setExistingRepoError('Format: owner/repository (e.g., my-org/my-repo)');
        } else {
            setExistingRepoError(undefined);
        }
    }, [updateEdsConfig, validateExistingRepo]);

    /**
     * Verify existing repository access
     */
    const verifyExistingRepo = useCallback((repoFullName: string) => {
        if (!repoFullName || !validateExistingRepo(repoFullName)) return;

        log.debug('Verifying GitHub repo access:', repoFullName);
        setIsVerifyingRepo(true);

        webviewClient.postMessage('verify-github-repo', {
            repoFullName,
        });
    }, [validateExistingRepo]);

    /**
     * Handle existing repo blur - trigger verification
     */
    const handleExistingRepoBlur = useCallback(() => {
        if (existingRepo && validateExistingRepo(existingRepo) && existingRepoVerified === undefined) {
            verifyExistingRepo(existingRepo);
        }
    }, [existingRepo, existingRepoVerified, validateExistingRepo, verifyExistingRepo]);

    /**
     * Handle DA.live org change
     */
    const handleDaLiveOrgChange = useCallback((value: string) => {
        updateEdsConfig({
            daLiveOrg: value,
            daLiveOrgVerified: undefined,
            daLiveOrgError: undefined,
        });
    }, [updateEdsConfig]);

    /**
     * Handle DA.live site change
     */
    const handleDaLiveSiteChange = useCallback((value: string) => {
        updateEdsConfig({ daLiveSite: value });
    }, [updateEdsConfig]);

    /**
     * Verify DA.live organization access
     */
    const verifyDaLiveOrg = useCallback((orgName: string) => {
        if (!orgName) return;

        log.debug('Verifying DA.live org access:', orgName);
        setIsVerifyingOrg(true);

        webviewClient.postMessage('verify-dalive-org', {
            orgName,
        });
    }, []);

    /**
     * Handle DA.live org blur - trigger verification
     */
    const handleDaLiveOrgBlur = useCallback(() => {
        if (daLiveOrg && daLiveOrgVerified === undefined) {
            verifyDaLiveOrg(daLiveOrg);
        }
    }, [daLiveOrg, daLiveOrgVerified, verifyDaLiveOrg]);

    // Listen for DA.live org verification result
    useEffect(() => {
        const unsubscribe = webviewClient.onMessage('dalive-org-verified', (data) => {
            const result = data as DaLiveOrgVerifiedData;
            log.debug('DA.live org verification result:', result);
            setIsVerifyingOrg(false);

            updateEdsConfig({
                daLiveOrgVerified: result.verified,
                daLiveOrgError: result.error,
            });
        });

        return unsubscribe;
    }, [updateEdsConfig]);

    // Listen for GitHub repo verification result
    useEffect(() => {
        const unsubscribe = webviewClient.onMessage('github-repo-verified', (data) => {
            const result = data as GitHubRepoVerifiedData;
            log.debug('GitHub repo verification result:', result);
            setIsVerifyingRepo(false);

            if (result.verified) {
                updateEdsConfig({ existingRepoVerified: true });
                setExistingRepoError(undefined);
            } else {
                updateEdsConfig({ existingRepoVerified: false });
                setExistingRepoError(result.error || 'Repository not found or no access');
            }
        });

        return unsubscribe;
    }, [updateEdsConfig]);

    // Update canProceed based on all requirements
    useEffect(() => {
        // Repository requirements depend on mode
        const repoValid = repoMode === 'new'
            ? (repoName && validateRepoName(repoName))
            : (existingRepo && validateExistingRepo(existingRepo) && existingRepoVerified === true);

        const isValid = repoValid &&
            daLiveOrg &&
            daLiveOrgVerified === true &&
            daLiveSite;

        setCanProceed(!!isValid);
    }, [repoMode, repoName, validateRepoName, existingRepo, validateExistingRepo, existingRepoVerified, daLiveOrg, daLiveOrgVerified, daLiveSite, setCanProceed]);

    return (
        <SingleColumnLayout>
            <Heading level={2} marginBottom="size-200">
                Repository Configuration
            </Heading>

            <Text marginBottom="size-400">
                Configure your GitHub repository and DA.live content source for Edge Delivery Services.
            </Text>

            {/* Repository Mode Selection */}
            <RadioGroup
                label="GitHub Repository"
                value={repoMode}
                onChange={(value) => handleRepoModeChange(value as RepoMode)}
                marginBottom="size-300"
            >
                <Radio value="new">Create new repository</Radio>
                <Radio value="existing">Use existing repository</Radio>
            </RadioGroup>

            {/* New Repository Name */}
            {repoMode === 'new' && (
                <TextField
                    label="Repository Name"
                    value={repoName}
                    onChange={handleRepoNameChange}
                    onBlur={() => {
                        if (repoName && !validateRepoName(repoName)) {
                            setRepoNameError('Must start with a letter or number');
                        }
                    }}
                    validationState={repoNameError ? 'invalid' : undefined}
                    errorMessage={repoNameError}
                    placeholder="my-eds-project"
                    description="Name for your new GitHub repository"
                    width="100%"
                    marginBottom="size-400"
                    isRequired
                />
            )}

            {/* Existing Repository */}
            {repoMode === 'existing' && (
                <>
                    <Flex alignItems="end" gap="size-200" marginBottom="size-200">
                        <TextField
                            label="Repository"
                            value={existingRepo}
                            onChange={handleExistingRepoChange}
                            onBlur={handleExistingRepoBlur}
                            validationState={existingRepoError ? 'invalid' : (existingRepoVerified ? 'valid' : undefined)}
                            errorMessage={existingRepoError}
                            placeholder="owner/repository"
                            description="Your existing GitHub repository (e.g., my-org/my-eds-site)"
                            width="100%"
                            isRequired
                        />

                        {isVerifyingRepo && (
                            <ProgressCircle
                                aria-label="Verifying repository"
                                isIndeterminate
                                size="S"
                            />
                        )}

                        {existingRepoVerified && !isVerifyingRepo && (
                            <Flex alignItems="center" gap="size-100">
                                <CheckmarkCircle
                                    size="S"
                                    UNSAFE_className="text-green-500"
                                />
                                <Text UNSAFE_className="text-green-600">
                                    Verified
                                </Text>
                            </Flex>
                        )}
                    </Flex>

                    {/* Reset to template option */}
                    <Checkbox
                        isSelected={resetToTemplate}
                        onChange={handleResetToTemplateChange}
                        marginBottom={resetToTemplate ? 'size-100' : 'size-400'}
                    >
                        Reset to template (replaces all content)
                    </Checkbox>

                    {/* Warning when reset is selected */}
                    {resetToTemplate && (
                        <Flex alignItems="center" gap="size-100" marginBottom="size-400">
                            <Alert size="S" UNSAFE_className="text-orange-500" />
                            <Text UNSAFE_style={{ color: 'var(--spectrum-semantic-notice-color-text-small)', fontSize: '12px' }}>
                                This will delete and recreate the repository with the selected template content.
                            </Text>
                        </Flex>
                    )}
                </>
            )}

            {/* DA.live Section */}
            <Heading level={3} marginBottom="size-200">
                DA.live Content Source
            </Heading>

            <Text marginBottom="size-300" UNSAFE_className="text-sm text-gray-600">
                DA.live provides content authoring for your Edge Delivery site.
            </Text>

            {/* DA.live Organization */}
            <Flex alignItems="end" gap="size-200" marginBottom="size-300">
                <TextField
                    label="Organization"
                    value={daLiveOrg}
                    onChange={handleDaLiveOrgChange}
                    onBlur={handleDaLiveOrgBlur}
                    placeholder="your-org"
                    description="Your DA.live organization name"
                    width="100%"
                    isRequired
                    validationState={daLiveOrgError ? 'invalid' : (daLiveOrgVerified ? 'valid' : undefined)}
                />

                {isVerifyingOrg && (
                    <ProgressCircle
                        aria-label="Verifying organization"
                        isIndeterminate
                        size="S"
                    />
                )}

                {daLiveOrgVerified && !isVerifyingOrg && (
                    <Flex alignItems="center" gap="size-100">
                        <CheckmarkCircle
                            size="S"
                            UNSAFE_className="text-green-500"
                        />
                        <Text UNSAFE_style={{ color: 'var(--spectrum-semantic-positive-color-text-small)' }}>
                            Verified
                        </Text>
                    </Flex>
                )}
            </Flex>

            {daLiveOrgError && (
                <Flex alignItems="center" gap="size-100" marginBottom="size-300">
                    <Alert
                        size="S"
                        UNSAFE_className="text-red-500"
                    />
                    <Text UNSAFE_style={{ color: 'var(--spectrum-semantic-negative-color-text-small)' }}>
                        {daLiveOrgError}
                    </Text>
                </Flex>
            )}

            {/* DA.live Site */}
            <TextField
                label="Site Name"
                value={daLiveSite}
                onChange={handleDaLiveSiteChange}
                placeholder="my-site"
                description="Name for your DA.live site"
                width="100%"
                isRequired
            />
        </SingleColumnLayout>
    );
}
