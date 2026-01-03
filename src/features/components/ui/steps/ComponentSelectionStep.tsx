import LockClosed from '@spectrum-icons/workflow/LockClosed';
import React, { useRef } from 'react';
import { useComponentSelection } from '../hooks/useComponentSelection';
import {
    View,
    Flex,
    Text,
    Select,
    SelectItem,
    Checkbox,
} from '@/core/ui/components/aria';
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
}

// Required frontend dependencies (always selected, locked)
const FRONTEND_DEPENDENCIES: ComponentOption[] = [
    { id: 'commerce-mesh', name: 'API Mesh' },
];

// Optional frontend addons (pre-selected by default, user can uncheck)
const FRONTEND_ADDONS: ComponentOption[] = [
    { id: 'demo-inspector', name: 'Demo Inspector' },
];

// Required backend services (always selected, locked)
const BACKEND_SERVICES: ComponentOption[] = [
    { id: 'catalog-service', name: 'Catalog Service' },
    { id: 'live-search', name: 'Live Search' },
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
        backendServices: BACKEND_SERVICES,
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
                <View className="flex-1" style={{ minWidth: '300px' }}>
                    <div ref={frontendPickerRef}>
                        <Text className="section-label">
                            Frontend
                        </Text>
                        <ErrorBoundary onError={(error) => log.error('Select error:', error)}>
                            <Select
                                label="Frontend System"
                                selectedKey={selectedFrontend}
                                onSelectionChange={(key) => setSelectedFrontend(key as string)}
                                placeholder="Select frontend system"
                                className={cn('cursor-pointer')}
                            >
                                {frontendOptions.map((opt) => (
                                    <SelectItem key={opt.id} id={opt.id} textValue={opt.name}>
                                        {opt.name}
                                    </SelectItem>
                                ))}
                            </Select>
                        </ErrorBoundary>
                        {selectedFrontend && (
                            <View className="mt-150">
                                {/* Required dependencies (locked) */}
                                {FRONTEND_DEPENDENCIES.map(dep => (
                                    <Checkbox
                                        key={dep.id}
                                        isSelected={selectedDependencies.has(dep.id)}
                                        isDisabled={true}
                                        onChange={(sel) => handleDependencyToggle(dep.id, sel)}
                                        className="checkbox-spacing"
                                    >
                                        <Flex alignItems="center" gap="size-50">
                                            <span className="text-gray-600"><LockClosed size="XS" /></span>
                                            <Text className="text-md">{dep.name}</Text>
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
                                        className="checkbox-spacing"
                                    >
                                        <Flex alignItems="center" gap="size-50">
                                            <Text className="text-md">{addon.name}</Text>
                                        </Flex>
                                    </Checkbox>
                                ))}
                            </View>
                        )}
                    </div>
                </View>

                {/* Backend */}
                <View className="flex-1" style={{ minWidth: '300px' }}>
                    <Text className="section-label">
                        Backend
                    </Text>
                    <ErrorBoundary onError={(error) => log.error('Select error:', error)}>
                        <Select
                            label="Backend System"
                            selectedKey={selectedBackend}
                            onSelectionChange={(key) => setSelectedBackend(key as string)}
                            placeholder="Select backend system"
                            className={cn('cursor-pointer')}
                        >
                            {backendOptions.map((opt) => (
                                <SelectItem key={opt.id} id={opt.id} textValue={opt.name}>
                                    {opt.name}
                                </SelectItem>
                            ))}
                        </Select>
                    </ErrorBoundary>
                    {selectedBackend && (
                        <View className="mt-150">
                            {/* All backend services are required (locked) */}
                            {BACKEND_SERVICES.map(svc => (
                                <Checkbox
                                    key={svc.id}
                                    isSelected={selectedServices.has(svc.id)}
                                    isDisabled={true}
                                    onChange={(sel) => handleServiceToggle(svc.id, sel)}
                                    className="checkbox-spacing"
                                >
                                    <Flex alignItems="center" gap="size-50">
                                        <span className="text-gray-600"><LockClosed size="XS" /></span>
                                        <Text className="text-md">{svc.name}</Text>
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
