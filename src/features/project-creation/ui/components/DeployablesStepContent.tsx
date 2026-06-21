/**
 * DeployablesStepContent Component (D2 Track B — Step 03)
 *
 * Catalog-driven deployables picker that replaces the single hardcoded mesh
 * on/off toggle. The mesh is now just one catalog row. Required rows render
 * locked+checked ("Included with your storefront"); optional rows toggle.
 * A custom-URL door lets the user add a deployable from a public GitHub repo,
 * reusing the shared parseGitHubUrl validator/canonicalizer (the same front
 * door AppBuilderCard uses).
 *
 * Modeled on BlockLibrariesStepContent: pure presentational, props are data +
 * callbacks only (no internal fetching).
 *
 * @module features/project-creation/ui/components/DeployablesStepContent
 */

import { Text, Checkbox, Divider, TextField, Button, Flex } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { parseGitHubUrl } from '@/core/utils/githubUrlParser';
import type { SelectableDeployable } from '@/features/project-creation/services/deployableSelection';
import type { AddonSource } from '@/types/demoPackages';

/** Default branch used when a custom GitHub URL omits one. */
const DEFAULT_BRANCH = 'main';

export interface DeployablesStepContentProps {
    /** Axis-filtered, requirement-annotated catalog rows (from getSelectableDeployables). */
    deployables: SelectableDeployable[];
    /** Currently-selected deployable ids. */
    selectedDeployables: string[];
    /** Toggle an optional deployable row. */
    onDeployableToggle: (id: string, isSelected: boolean) => void;
    /** Add a custom deployable from a canonicalized GitHub source. */
    onAddCustomDeployable: (source: AddonSource) => void;
}

/** One catalog row: required → locked+checked, optional → toggleable. */
function DeployableRow({
    deployable,
    isSelected,
    onToggle,
}: {
    deployable: SelectableDeployable;
    isSelected: boolean;
    onToggle: (id: string, isSelected: boolean) => void;
}) {
    const isRequired = deployable.requirement === 'required';
    const description = isRequired ? 'Included with your storefront' : deployable.description;
    return (
        <Checkbox
            isSelected={isRequired || isSelected}
            isDisabled={isRequired}
            onChange={selected => onToggle(deployable.id, selected)}
        >
            <span className="addon-label">
                <span className="addon-name">{deployable.name}</span>
                <span className="addon-description">{description}</span>
            </span>
        </Checkbox>
    );
}

/** Custom-URL door reusing parseGitHubUrl for validation + canonicalization. */
function CustomDeployableDoor({
    onAddCustomDeployable,
}: {
    onAddCustomDeployable: (source: AddonSource) => void;
}) {
    const [gitUrl, setGitUrl] = useState('');
    const parsed = parseGitHubUrl(gitUrl.trim());

    const handleAdd = () => {
        if (!parsed) return;
        onAddCustomDeployable({ ...parsed, branch: DEFAULT_BRANCH });
        setGitUrl('');
    };

    return (
        <>
            <Divider size="S" marginTop="size-300" marginBottom="size-200" />
            <Text UNSAFE_className="description-block-sm">Custom Deployable</Text>
            <Flex direction="column" gap="size-150">
                <TextField
                    label="Custom deployable URL"
                    placeholder="https://github.com/owner/repo"
                    value={gitUrl}
                    onChange={setGitUrl}
                    width="100%"
                />
                <Flex>
                    <Button variant="primary" isDisabled={!parsed} onPress={handleAdd}>
                        Add
                    </Button>
                </Flex>
            </Flex>
        </>
    );
}

export const DeployablesStepContent: React.FC<DeployablesStepContentProps> = ({
    deployables,
    selectedDeployables,
    onDeployableToggle,
    onAddCustomDeployable,
}) => (
    <>
        <Text UNSAFE_className="description-block">Which deployables should be included?</Text>
        <Text UNSAFE_className="description-block-sm">
            Required deployables are included automatically. Optional ones add capabilities like API Mesh.
        </Text>
        {deployables.length === 0 ? (
            <Text UNSAFE_className="description-block-sm">
                No deployables are available for this architecture.
            </Text>
        ) : (
            <div className="architecture-addons">
                {deployables.map(deployable => (
                    <DeployableRow
                        key={deployable.id}
                        deployable={deployable}
                        isSelected={selectedDeployables.includes(deployable.id)}
                        onToggle={onDeployableToggle}
                    />
                ))}
            </div>
        )}
        <CustomDeployableDoor onAddCustomDeployable={onAddCustomDeployable} />
    </>
);
