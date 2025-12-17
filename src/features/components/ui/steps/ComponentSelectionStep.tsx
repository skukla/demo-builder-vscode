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
import { ErrorBoundary } from '@/core/ui/components/ErrorBoundary';
import { useFocusOnMount } from '@/core/ui/hooks';
import { cn } from '@/core/ui/utils/classNames';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import { BaseStepProps } from '@/types/wizard';

const log = webviewLogger('ComponentSelectionStep');

interface ComponentSelectionStepProps extends BaseStepProps {
    componentsData?: Record<string, unknown>;
}

interface DependencyOption {
    id: string;
    name: string;
    required: boolean;
}

interface ComponentOption {
    id: string;
    name: string;
    description: string;
}

interface ComponentsData {
    frontends?: ComponentOption[];
    backends?: ComponentOption[];
    integrations?: ComponentOption[];
    appBuilder?: ComponentOption[];
}

// Frontend dependencies
const FRONTEND_DEPENDENCIES: DependencyOption[] = [
    { id: 'commerce-mesh', name: 'API Mesh', required: true },
    { id: 'demo-inspector', name: 'Demo Inspector', required: false },
];

// Backend services (required for PaaS)
const BACKEND_SERVICES: DependencyOption[] = [
    { id: 'catalog-service', name: 'Catalog Service', required: true },
    { id: 'live-search', name: 'Live Search', required: true },
];

// Default options (used if componentsData not provided)
const DEFAULT_FRONTENDS: ComponentOption[] = [
    { id: 'citisignal-nextjs', name: 'Headless CitiSignal', description: 'NextJS-based storefront with Adobe mesh integration' },
];

const DEFAULT_BACKENDS: ComponentOption[] = [
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
        backendServices: BACKEND_SERVICES,
    });

    // Get options from data or use defaults
    const dataTyped = (componentsData || {}) as ComponentsData;
    const frontendOptions = dataTyped.frontends || DEFAULT_FRONTENDS;
    const backendOptions = dataTyped.backends || DEFAULT_BACKENDS;

    return (
        <div className="max-w-800 w-full m-0 p-5">
            {/* Frontend and Backend Selection */}
            <Flex gap="size-300" wrap>
                {/* Frontend */}
                <View flex="1" minWidth="300px">
                    <div ref={frontendPickerRef}>
                        <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'mb-2', 'text-uppercase', 'letter-spacing-05')}>
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
                                {FRONTEND_DEPENDENCIES.map(dep => (
                                    <Checkbox
                                        key={dep.id}
                                        isSelected={selectedDependencies.has(dep.id)}
                                        isDisabled={dep.required}
                                        onChange={(sel) => handleDependencyToggle(dep.id, sel)}
                                        UNSAFE_className="mb-1"
                                    >
                                        <Flex alignItems="center" gap="size-50">
                                            {dep.required && <LockClosed size="XS" UNSAFE_className="text-gray-600" />}
                                            <Text UNSAFE_className="text-md">{dep.name}</Text>
                                        </Flex>
                                    </Checkbox>
                                ))}
                            </View>
                        )}
                    </div>
                </View>

                {/* Backend */}
                <View flex="1" minWidth="300px">
                    <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'mb-2', 'text-uppercase', 'letter-spacing-05')}>
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
                    {selectedBackend && (
                        <View marginTop="size-150">
                            {BACKEND_SERVICES.map(svc => (
                                <Checkbox
                                    key={svc.id}
                                    isSelected={selectedServices.has(svc.id)}
                                    isDisabled={svc.required}
                                    onChange={(sel) => handleServiceToggle(svc.id, sel)}
                                    UNSAFE_className="mb-1"
                                >
                                    <Flex alignItems="center" gap="size-50">
                                        {svc.required && <LockClosed size="XS" UNSAFE_className="text-gray-600" />}
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
