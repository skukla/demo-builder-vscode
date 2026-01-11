import {
    View,
    Flex,
    Text,
    Picker,
    Item,
    Checkbox,
} from '@adobe/react-spectrum';
import LockClosed from '@spectrum-icons/workflow/LockClosed';
import React, { useRef } from 'react';
import { useComponentSelection } from '../hooks/useComponentSelection';
import { COMPONENT_IDS, isMeshComponentId } from '@/core/constants';
import { ErrorBoundary } from '@/core/ui/components/ErrorBoundary';
import { useFocusOnMount } from '@/core/ui/hooks';
import { cn } from '@/core/ui/utils/classNames';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import { BaseStepProps } from '@/types/wizard';

const log = webviewLogger('ComponentSelectionStep');

interface ComponentSelectionStepProps extends BaseStepProps {
    componentsData?: Record<string, unknown>;
}

/** Simple option for dependencies, addons, and services (no description needed) */
interface ComponentOption {
    id: string;
    name: string;
}

/** Picker option with description for frontend/backend selection */
interface PickerOption {
    id: string;
    name: string;
    description: string;
}

interface ComponentsData {
    frontends?: PickerOption[];
    backends?: PickerOption[];
    integrations?: PickerOption[];
    appBuilder?: PickerOption[];
    addons?: Array<{ id: string; name: string; configuration?: { providesServices?: string[] } }>;
    services?: Record<string, { id: string; name: string }>;
}

// Required frontend dependencies (always selected, locked)
// Note: Mesh dependency is handled dynamically through component registry
// based on selected stack (eds-commerce-mesh or headless-commerce-mesh)
const FRONTEND_DEPENDENCIES: ComponentOption[] = [];

// Optional frontend addons (pre-selected by default, user can uncheck)
const FRONTEND_ADDONS: ComponentOption[] = [
    { id: COMPONENT_IDS.DEMO_INSPECTOR, name: 'Demo Inspector' },
];

// Default options (used if componentsData not provided)
const DEFAULT_FRONTENDS: PickerOption[] = [
    { id: 'headless', name: 'Headless Storefront', description: 'Next.js-based headless storefront with Adobe mesh integration' },
];

const DEFAULT_BACKENDS: PickerOption[] = [
    { id: 'adobe-commerce-paas', name: 'Adobe Commerce PaaS', description: 'Adobe Commerce DSN instance' },
];

export const ComponentSelectionStep: React.FC<ComponentSelectionStepProps> = ({
    state,
    updateState,
    setCanProceed,
    componentsData,
}) => {
    const frontendPickerRef = useRef<HTMLDivElement>(null);

    // Focus management: focus the frontend picker button on mount
    useFocusOnMount(frontendPickerRef, { selector: 'button' });

    const {
        selectedFrontend,
        setSelectedFrontend,
        selectedBackend,
        setSelectedBackend,
        selectedDependencies,
        selectedServices,
        servicesToShow,
        // Note: selectedIntegrations, selectedAppBuilder, handleIntegrationToggle, handleAppBuilderToggle
        // are still available from the hook but not destructured since sections were removed
        handleDependencyToggle,
        handleServiceToggle,
    } = useComponentSelection({
        state,
        updateState,
        setCanProceed,
        frontendDependencies: FRONTEND_DEPENDENCIES,
        frontendAddons: FRONTEND_ADDONS,
        componentsData: (componentsData || {}) as {
            backends?: Array<{ id: string; configuration?: { requiredServices?: string[]; providesServices?: string[] } }>;
            addons?: Array<{ id: string; configuration?: { providesServices?: string[] } }>;
            services?: Record<string, { id: string; name: string }>;
        },
        selectedAddons: state.selectedAddons,
    });

    // Get options from data or use defaults
    const dataTyped = (componentsData || {}) as ComponentsData;
    const frontendOptions = dataTyped.frontends || DEFAULT_FRONTENDS;
    const backendOptions = dataTyped.backends || DEFAULT_BACKENDS;

    return (
        <div className="step-main-content">
            {/* Frontend and Backend Selection */}
            <Flex gap="size-300" wrap>
                {/* Frontend */}
                <View flex="1" minWidth="300px">
                    <div ref={frontendPickerRef}>
                        <Text UNSAFE_className="section-label">
                            Frontend
                        </Text>
                        <ErrorBoundary onError={(error) => log.error('Picker error:', error)}>
                            <Picker
                                width="100%"
                                selectedKey={selectedFrontend}
                                onSelectionChange={(key) => setSelectedFrontend(key as string)}
                                placeholder="Select frontend system"
                                aria-label="Select frontend system"
                                isQuiet={false}
                                align="start"
                                direction="bottom"
                                shouldFlip={false}
                                menuWidth="size-4600"
                                UNSAFE_className={cn('cursor-pointer')}
                            >
                                {frontendOptions.map((opt) => (
                                    <Item key={opt.id} textValue={opt.name}>
                                        <Text>{opt.name}</Text>
                                        <Text slot="description">{opt.description}</Text>
                                    </Item>
                                ))}
                            </Picker>
                        </ErrorBoundary>
                        {selectedFrontend && (
                            <View marginTop="size-150">
                                {/* Required dependencies (locked) */}
                                {FRONTEND_DEPENDENCIES.map(dep => (
                                    <Checkbox
                                        key={dep.id}
                                        isSelected={selectedDependencies.has(dep.id)}
                                        isDisabled={true}
                                        onChange={(sel) => handleDependencyToggle(dep.id, sel)}
                                        UNSAFE_className="checkbox-spacing"
                                    >
                                        <Flex alignItems="center" gap="size-50">
                                            <LockClosed size="XS" UNSAFE_className="text-gray-600" />
                                            <Text UNSAFE_className="text-md">{dep.name}</Text>
                                        </Flex>
                                    </Checkbox>
                                ))}
                                {/* Optional addons (pre-selected, user can uncheck) */}
                                {FRONTEND_ADDONS.map(addon => (
                                    <Checkbox
                                        key={addon.id}
                                        isSelected={selectedDependencies.has(addon.id)}
                                        isDisabled={false}
                                        onChange={(sel) => handleDependencyToggle(addon.id, sel)}
                                        UNSAFE_className="checkbox-spacing"
                                    >
                                        <Flex alignItems="center" gap="size-50">
                                            <Text UNSAFE_className="text-md">{addon.name}</Text>
                                        </Flex>
                                    </Checkbox>
                                ))}
                            </View>
                        )}
                    </div>
                </View>

                {/* Backend */}
                <View flex="1" minWidth="300px">
                    <Text UNSAFE_className="section-label">
                        Backend
                    </Text>
                    <ErrorBoundary onError={(error) => log.error('Picker error:', error)}>
                        <Picker
                            width="100%"
                            selectedKey={selectedBackend}
                            onSelectionChange={(key) => setSelectedBackend(key as string)}
                            placeholder="Select backend system"
                            aria-label="Select backend system"
                            isQuiet={false}
                            align="start"
                            direction="bottom"
                            shouldFlip={false}
                            menuWidth="size-4600"
                            UNSAFE_className={cn('cursor-pointer')}
                        >
                            {backendOptions.map((opt) => (
                                <Item key={opt.id} textValue={opt.name}>
                                    <Text>{opt.name}</Text>
                                    <Text slot="description">{opt.description}</Text>
                                </Item>
                            ))}
                        </Picker>
                    </ErrorBoundary>
                    {selectedBackend && servicesToShow.length > 0 && (
                        <View marginTop="size-150">
                            {/* Required backend services (dynamically resolved) */}
                            {servicesToShow.map(svc => (
                                <Checkbox
                                    key={svc.id}
                                    isSelected={selectedServices.has(svc.id)}
                                    isDisabled={true}
                                    onChange={(sel) => handleServiceToggle(svc.id, sel)}
                                    UNSAFE_className="checkbox-spacing"
                                >
                                    <Flex alignItems="center" gap="size-50">
                                        <LockClosed size="XS" UNSAFE_className="text-gray-600" />
                                        <Text UNSAFE_className="text-md">{svc.name}</Text>
                                    </Flex>
                                </Checkbox>
                            ))}
                        </View>
                    )}
                </View>
            </Flex>
        </div>
    );
};
