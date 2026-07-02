/**
 * AppBuilderComponentsStepContent Component (D2 Track B — Step 03)
 *
 * Catalog-driven appBuilderComponents picker that replaces the single hardcoded mesh
 * on/off toggle. The mesh is now just one catalog row. Required rows render
 * locked+checked ("Included with your storefront"); optional rows toggle.
 * A custom-URL door lets the user add an App Builder component from a public GitHub repo,
 * reusing the shared parseGitHubUrl validator/canonicalizer (the same front
 * door AppBuilderCard uses).
 *
 * Modeled on BlockLibrariesStepContent: pure presentational, props are data +
 * callbacks only (no internal fetching).
 *
 * @module features/project-creation/ui/components/AppBuilderComponentsStepContent
 */

import { Text, Checkbox, Divider, TextField, Button, Flex } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { parseGitHubUrl } from '@/core/utils/githubUrlParser';
import type { SelectableAppBuilderComponent } from '@/features/project-creation/services/appBuilderComponentSelection';
import type { AddonSource } from '@/types/demoPackages';

/** Default branch used when a custom GitHub URL omits one. */
const DEFAULT_BRANCH = 'main';

export interface AppBuilderComponentsStepContentProps {
    /** Axis-filtered, requirement-annotated catalog rows (from getSelectableAppBuilderComponents). */
    appBuilderComponents: SelectableAppBuilderComponent[];
    /** Currently-selected appBuilderComponent ids. */
    selectedAppBuilderComponents: string[];
    /** Toggle an optional appBuilderComponent row. */
    onAppBuilderComponentToggle: (id: string, isSelected: boolean) => void;
    /** Add a custom appBuilderComponent from a canonicalized GitHub source. */
    onAddCustomAppBuilderComponent: (source: AddonSource) => void;
    /**
     * Whether to render the custom-URL door. Defaults to true to preserve
     * existing callers. The Project Builder passes false this slice — the door
     * is inert until creation-side provisioning exists (tracked as backlog).
     */
    showCustomDoor?: boolean;
}

/** One catalog row: required → locked+checked, optional → toggleable. */
function AppBuilderComponentRow({
    appBuilderComponent,
    isSelected,
    onToggle,
}: {
    appBuilderComponent: SelectableAppBuilderComponent;
    isSelected: boolean;
    onToggle: (id: string, isSelected: boolean) => void;
}) {
    const isRequired = appBuilderComponent.requirement === 'required';
    const description = isRequired ? 'Included with your storefront' : appBuilderComponent.description;
    return (
        <Checkbox
            isSelected={isRequired || isSelected}
            isDisabled={isRequired}
            onChange={selected => onToggle(appBuilderComponent.id, selected)}
        >
            <span className="addon-label">
                <span className="addon-name">{appBuilderComponent.name}</span>
                <span className="addon-description">{description}</span>
            </span>
        </Checkbox>
    );
}

/** Custom-URL door reusing parseGitHubUrl for validation + canonicalization. */
function CustomAppBuilderComponentDoor({
    onAddCustomAppBuilderComponent,
}: {
    onAddCustomAppBuilderComponent: (source: AddonSource) => void;
}) {
    const [gitUrl, setGitUrl] = useState('');
    const parsed = parseGitHubUrl(gitUrl.trim());

    const handleAdd = () => {
        if (!parsed) return;
        onAddCustomAppBuilderComponent({ ...parsed, branch: DEFAULT_BRANCH });
        setGitUrl('');
    };

    return (
        <>
            <Divider size="S" marginTop="size-300" marginBottom="size-200" />
            <Text UNSAFE_className="description-block-sm">Custom AppBuilderComponent</Text>
            <Flex direction="column" gap="size-150">
                <TextField
                    label="Custom App Builder component URL"
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

export const AppBuilderComponentsStepContent: React.FC<AppBuilderComponentsStepContentProps> = ({
    appBuilderComponents,
    selectedAppBuilderComponents,
    onAppBuilderComponentToggle,
    onAddCustomAppBuilderComponent,
    showCustomDoor = true,
}) => (
    <>
        <Text UNSAFE_className="description-block">Which App Builder components should be included?</Text>
        <Text UNSAFE_className="description-block-sm">
            Required appBuilderComponents are included automatically. Optional ones add capabilities like API Mesh.
        </Text>
        {appBuilderComponents.length === 0 ? (
            <Text UNSAFE_className="description-block-sm">
                No App Builder components are available for this architecture.
            </Text>
        ) : (
            <div className="architecture-addons">
                {appBuilderComponents.map(appBuilderComponent => (
                    <AppBuilderComponentRow
                        key={appBuilderComponent.id}
                        appBuilderComponent={appBuilderComponent}
                        isSelected={selectedAppBuilderComponents.includes(appBuilderComponent.id)}
                        onToggle={onAppBuilderComponentToggle}
                    />
                ))}
            </div>
        )}
        {showCustomDoor && (
            <CustomAppBuilderComponentDoor onAddCustomAppBuilderComponent={onAddCustomAppBuilderComponent} />
        )}
    </>
);
