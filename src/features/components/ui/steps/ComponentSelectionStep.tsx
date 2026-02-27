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
        selectedServices,
        servicesToShow,
        // Note: selectedIntegrations, selectedAppBuilder, handleIntegrationToggle, handleAppBuilderToggle
        // are still available from the hook but not destructured since sections were removed
        handleServiceToggle,
    } = useComponentSelection({
        state,
        updateState,
        setCanProceed,
        componentsData: (componentsData || {}) as {
            backends?: Array<{ id: string; name: string; configuration?: { requiredServices?: string[]; providesServices?: string[] } }>;
            addons?: Array<{ id: string; name: string; configuration?: { providesServices?: string[] } }>;
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
