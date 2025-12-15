import { useState, useEffect, useRef } from 'react';
import { useDebouncedValue, useSetToggle } from '@/core/ui/hooks';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { WizardState } from '@/types/webview';

interface DependencyOption {
    id: string;
    name: string;
    required: boolean;
}

interface UseComponentSelectionProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
    frontendDependencies: DependencyOption[];
    backendServices: DependencyOption[];
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
        state.components?.appBuilderApps || [],
    );

    // Track last sent selection to prevent duplicate messages
    const lastSentSelectionRef = useRef<string>('');

    // Create debounced versions (wait 500ms after last change)
    const debouncedFrontend = useDebouncedValue(selectedFrontend, 500);
    const debouncedBackend = useDebouncedValue(selectedBackend, 500);
    const debouncedDependencies = useDebouncedValue(selectedDependencies, 500);
    const debouncedServices = useDebouncedValue(selectedServices, 500);
    const debouncedIntegrations = useDebouncedValue(selectedIntegrations, 500);
    const debouncedAppBuilder = useDebouncedValue(selectedAppBuilder, 500);

    // Initialize required dependencies when frontend changes
    useEffect(() => {
        if (selectedFrontend) {
            const requiredDeps = frontendDependencies
                .filter(d => d.required)
                .map(d => d.id);
            setSelectedDependencies(prev => {
                const newSet = new Set(prev);
                requiredDeps.forEach(dep => newSet.add(dep));
                return newSet;
            });
        }
    }, [selectedFrontend, frontendDependencies]);

    // Initialize required services when backend changes
    useEffect(() => {
        if (selectedBackend) {
            const requiredSvcs = backendServices
                .filter(s => s.required)
                .map(s => s.id);
            setSelectedServices(prev => {
                const newSet = new Set(prev);
                requiredSvcs.forEach(service => newSet.add(service));
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
            appBuilderApps: Array.from(debouncedAppBuilder),
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
