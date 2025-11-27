import {
    View,
    Flex,
    Text,
    Picker,
    Item,
    Checkbox,
    Divider,
} from '@adobe/react-spectrum';
import LockClosed from '@spectrum-icons/workflow/LockClosed';
import React, { useEffect, useRef } from 'react';
import { WizardState } from '@/types/webview';
import { cn } from '@/core/ui/utils/classNames';
import { ErrorBoundary } from '@/core/ui/components/ErrorBoundary';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { useComponentSelection } from '../hooks/useComponentSelection';

interface ComponentSelectionStepProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
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

const DEFAULT_INTEGRATIONS: ComponentOption[] = [
    { id: 'experience-platform', name: 'Experience Platform', description: 'Adobe Experience Platform integration' },
];

const DEFAULT_APP_BUILDER: ComponentOption[] = [
    { id: 'integration-service', name: 'Integration Service', description: 'Custom integration service app' },
];

export const ComponentSelectionStep: React.FC<ComponentSelectionStepProps> = ({
    state,
    updateState,
    setCanProceed,
    componentsData,
}) => {
    const frontendPickerRef = useRef<HTMLDivElement>(null);

    const {
        selectedFrontend,
        setSelectedFrontend,
        selectedBackend,
        setSelectedBackend,
        selectedDependencies,
        selectedServices,
        selectedIntegrations,
        selectedAppBuilder,
        handleDependencyToggle,
        handleServiceToggle,
        handleIntegrationToggle,
        handleAppBuilderToggle,
    } = useComponentSelection({
        state,
        updateState,
        setCanProceed,
        frontendDependencies: FRONTEND_DEPENDENCIES,
        backendServices: BACKEND_SERVICES,
    });

    // Focus management for frontend picker
    useEffect(() => {
        const container = frontendPickerRef.current;
        if (!container) return;

        let focused = false;
        const tryFocus = () => {
            if (focused) return;
            const button = container.querySelector('button');
            if (button) {
                button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
                button.focus();
                focused = true;
            }
        };

        const observer = new MutationObserver(tryFocus);
        observer.observe(container, { childList: true, subtree: true, attributes: true });
        tryFocus();

        const fallback = setTimeout(() => {
            tryFocus();
            observer.disconnect();
        }, TIMEOUTS.FOCUS_FALLBACK);

        return () => {
            observer.disconnect();
            clearTimeout(fallback);
        };
    }, []);

    // Get options from data or use defaults
    const dataTyped = (componentsData || {}) as ComponentsData;
    const frontendOptions = dataTyped.frontends || DEFAULT_FRONTENDS;
    const backendOptions = dataTyped.backends || DEFAULT_BACKENDS;
    const integrationsOptions = dataTyped.integrations || DEFAULT_INTEGRATIONS;
    const appBuilderOptions = dataTyped.appBuilder || DEFAULT_APP_BUILDER;

    return (
        <div style={{ maxWidth: '800px', width: '100%', margin: '0', padding: '24px' }}>
            {/* Frontend and Backend */}
            <Flex gap="size-300" wrap marginBottom="size-300">
                {/* Frontend */}
                <View flex="1" minWidth="300px">
                    <div ref={frontendPickerRef}>
                        <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'mb-2', 'text-uppercase', 'letter-spacing-05')}>
                            Frontend
                        </Text>
                        <ErrorBoundary onError={console.error}>
                            <Picker
                                width="100%"
                                selectedKey={selectedFrontend}
                                onSelectionChange={(key) => setSelectedFrontend(key as string)}
                                placeholder="Select frontend system"
                                aria-label="Select frontend system"
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
                    <ErrorBoundary onError={console.error}>
                        <Picker
                            width="100%"
                            selectedKey={selectedBackend}
                            onSelectionChange={(key) => setSelectedBackend(key as string)}
                            placeholder="Select backend system"
                            aria-label="Select backend system"
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

            <Divider size="S" />

            {/* External Systems and App Builder */}
            <Flex gap="size-300" wrap marginTop="size-300">
                {/* External Systems */}
                <View flex="1" minWidth="300px">
                    <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'mb-2', 'text-uppercase', 'letter-spacing-05')}>
                        External Systems
                    </Text>
                    <View UNSAFE_className={cn('border', 'rounded', 'bg-gray-50', 'p-3')}>
                        {integrationsOptions.map((system) => (
                            <Checkbox
                                key={system.id}
                                isSelected={selectedIntegrations.has(system.id)}
                                onChange={(sel) => handleIntegrationToggle(system.id, sel)}
                                UNSAFE_className="mb-2"
                            >
                                <Flex direction="column" gap="size-50">
                                    <Text UNSAFE_className={cn('text-md', 'font-medium', 'block')}>{system.name}</Text>
                                    <Text UNSAFE_className={cn('text-sm', 'text-gray-600', 'block')}>{system.description}</Text>
                                </Flex>
                            </Checkbox>
                        ))}
                    </View>
                </View>

                {/* App Builder Apps */}
                <View flex="1" minWidth="300px">
                    <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'mb-2', 'text-uppercase', 'letter-spacing-05')}>
                        App Builder Apps
                    </Text>
                    <View UNSAFE_className={cn('border', 'rounded', 'bg-gray-50', 'p-3')}>
                        {appBuilderOptions.map((app) => (
                            <Checkbox
                                key={app.id}
                                isSelected={selectedAppBuilder.has(app.id)}
                                onChange={(sel) => handleAppBuilderToggle(app.id, sel)}
                                UNSAFE_className="mb-2"
                            >
                                <Flex direction="column" gap="size-50">
                                    <Text UNSAFE_className={cn('text-md', 'font-medium', 'block')}>{app.name}</Text>
                                    <Text UNSAFE_className={cn('text-sm', 'text-gray-600', 'block')}>{app.description}</Text>
                                </Flex>
                            </Checkbox>
                        ))}
                    </View>
                </View>
            </Flex>
        </div>
    );
};
