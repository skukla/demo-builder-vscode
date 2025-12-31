import { useState, useEffect, useRef } from 'react';
import { useDebouncedValue, useSetToggle } from '@/core/ui/hooks';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { WizardState } from '@/types/webview';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

/** Component option for required dependencies or services */
interface ComponentOption {
    id: string;
    name: string;
}

interface UseComponentSelectionProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
    /** Required frontend dependencies (always selected, locked) */
    frontendDependencies: ComponentOption[];
    /** Optional frontend addons (pre-selected by default, user can uncheck) */
    frontendAddons: ComponentOption[];
    /** Required backend services (always selected, locked) */
    backendServices: ComponentOption[];
}

interface UseComponentSelectionReturn {
    selectedFrontend: string;
    setSelectedFrontend: (value: string) => void;
    selectedBackend: string;
    setSelectedBackend: (value: string) => void;
    selectedDependencies: Set<string>;
    selectedServices: Set<string>;
    selectedIntegrations: Set<string>;
    selectedAppBuilder: Set<string>;
    handleDependencyToggle: (id: string, selected: boolean) => void;
    handleServiceToggle: (id: string, selected: boolean) => void;
    handleIntegrationToggle: (id: string, selected: boolean) => void;
    handleAppBuilderToggle: (id: string, selected: boolean) => void;
}

export function useComponentSelection({
    state,
    updateState,
    setCanProceed,
    frontendDependencies,
    frontendAddons,
    backendServices,
}: UseComponentSelectionProps): UseComponentSelectionReturn {
    // Initialize from state (includes defaults from init)
    const [selectedFrontend, setSelectedFrontend] = useState<string>(state.components?.frontend || '');
    const [selectedBackend, setSelectedBackend] = useState<string>(state.components?.backend || '');

    // Use useSetToggle for multi-select state - provides Set + toggle handler in one
    const [selectedDependencies, handleDependencyToggle, setSelectedDependencies] = useSetToggle<string>(
        state.components?.dependencies || [],
    );
    const [selectedServices, handleServiceToggle, setSelectedServices] = useSetToggle<string>(
        state.components?.services || [],
    );
    const [selectedIntegrations, handleIntegrationToggle] = useSetToggle<string>(
        state.components?.integrations || [],
    );
    const [selectedAppBuilder, handleAppBuilderToggle] = useSetToggle<string>(
        state.components?.appBuilder || [],
    );

    // Track last sent selection to prevent duplicate messages
    const lastSentSelectionRef = useRef<string>('');

    // Create debounced versions (wait for debounce delay after last change)
    const debouncedFrontend = useDebouncedValue(selectedFrontend, FRONTEND_TIMEOUTS.COMPONENT_DEBOUNCE);
    const debouncedBackend = useDebouncedValue(selectedBackend, FRONTEND_TIMEOUTS.COMPONENT_DEBOUNCE);
    const debouncedDependencies = useDebouncedValue(selectedDependencies, FRONTEND_TIMEOUTS.COMPONENT_DEBOUNCE);
    const debouncedServices = useDebouncedValue(selectedServices, FRONTEND_TIMEOUTS.COMPONENT_DEBOUNCE);
    const debouncedIntegrations = useDebouncedValue(selectedIntegrations, FRONTEND_TIMEOUTS.COMPONENT_DEBOUNCE);
    const debouncedAppBuilder = useDebouncedValue(selectedAppBuilder, FRONTEND_TIMEOUTS.COMPONENT_DEBOUNCE);

    // Initialize dependencies and addons when frontend changes
    useEffect(() => {
        if (selectedFrontend) {
            // Add all required dependencies (locked) + all addons (pre-selected but optional)
            const depsToAdd = [
                ...frontendDependencies.map(d => d.id),
                ...frontendAddons.map(a => a.id),
            ];
            setSelectedDependencies(prev => {
                const newSet = new Set(prev);
                depsToAdd.forEach(dep => newSet.add(dep));
                return newSet;
            });
        }
    }, [selectedFrontend, frontendDependencies, frontendAddons]);

    // Initialize required services when backend changes
    useEffect(() => {
        if (selectedBackend) {
            // All backend services are required (locked)
            const servicesToAdd = backendServices.map(s => s.id);
            setSelectedServices(prev => {
                const newSet = new Set(prev);
                servicesToAdd.forEach(service => newSet.add(service));
                return newSet;
            });
        }
    }, [selectedBackend, backendServices]);

    // Update parent state and canProceed using debounced values
    useEffect(() => {
        const isValid = !!(debouncedFrontend && debouncedBackend);
        setCanProceed(isValid);

        const components = {
            frontend: debouncedFrontend,
            backend: debouncedBackend,
            dependencies: Array.from(debouncedDependencies),
            services: Array.from(debouncedServices),
            integrations: Array.from(debouncedIntegrations),
            appBuilder: Array.from(debouncedAppBuilder),
        };

        updateState({ components });

        // Send selection to backend for prerequisite determination
        const selectionKey = JSON.stringify(components);
        if (selectionKey !== lastSentSelectionRef.current) {
            lastSentSelectionRef.current = selectionKey;
            webviewClient.postMessage('update-component-selection', components);
        }
    }, [debouncedFrontend, debouncedBackend, debouncedDependencies, debouncedServices, debouncedIntegrations, debouncedAppBuilder, setCanProceed, updateState]);

    // Toggle handlers are now provided by useSetToggle above

    return {
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
    };
}
