import { useState, useEffect, useRef, useMemo } from 'react';
import { useDebouncedValue, useSetToggle } from '@/core/ui/hooks';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { WizardState } from '@/types/webview';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
import { RawComponentDefinition } from '@/types/components';

/**
 * Resolves service dependencies for a given stack configuration.
 * Determines which services are missing based on backend requirements and addon provisions.
 *
 * @param backend - The selected backend component
 * @param addons - Array of selected addon components
 * @param explicitServices - Services explicitly selected by the user
 * @returns Object with missingServices array
 */
function resolveServices(
    backend: RawComponentDefinition,
    addons: RawComponentDefinition[],
    explicitServices: string[] = [],
): { missingServices: string[] } {
    // Collect all required services from backend
    const requiredServices = backend.configuration?.requiredServices || [];

    // Collect all provided services from backend, addons, and explicit services
    const providedServices = new Set<string>([
        ...(backend.configuration?.providesServices || []),
        ...addons.flatMap((addon) => addon.configuration?.providesServices || []),
        ...explicitServices,
    ]);

    // Determine missing services
    const missingServices = requiredServices.filter((serviceId) => !providedServices.has(serviceId));

    return { missingServices };
}

/** Component option for required dependencies or services */
interface ComponentOption {
    id: string;
    name: string;
}

interface ComponentsData {
    backends?: RawComponentDefinition[];
    addons?: RawComponentDefinition[];
    services?: Record<string, { id: string; name: string }>;
}

interface UseComponentSelectionProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    setCanProceed: (canProceed: boolean) => void;
    /** Required frontend dependencies (always selected, locked) */
    frontendDependencies: ComponentOption[];
    /** Optional frontend addons (pre-selected by default, user can uncheck) */
    frontendAddons: ComponentOption[];
    /** Components data from registry (for service resolution) */
    componentsData?: ComponentsData;
    /** Selected addons from state (for service resolution) */
    selectedAddons?: string[];
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
    /** Services that need to be shown in the UI (missing services that need to be added) */
    servicesToShow: ComponentOption[];
}

export function useComponentSelection({
    state,
    updateState,
    setCanProceed,
    frontendDependencies,
    frontendAddons,
    componentsData,
    selectedAddons = [],
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

    // Dynamically resolve which services need to be shown based on backend and addons
    const servicesToShow = useMemo<ComponentOption[]>(() => {
        if (!selectedBackend || !componentsData) {
            return [];
        }

        // Find the selected backend definition
        const backend = componentsData.backends?.find(b => b.id === selectedBackend);
        if (!backend) {
            return [];
        }

        // Find selected addon definitions
        const addons = componentsData.addons?.filter(a => selectedAddons.includes(a.id)) || [];

        // Resolve missing services using the service resolution algorithm
        const { missingServices } = resolveServices(backend, addons, []);

        // Map missing service IDs to ComponentOptions with names from the services registry
        return missingServices
            .map(serviceId => {
                const service = componentsData.services?.[serviceId];
                return service ? { id: serviceId, name: service.name } : null;
            })
            .filter((svc): svc is ComponentOption => svc !== null);
    }, [selectedBackend, selectedAddons, componentsData]);

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

    // Initialize required services when backend changes or addons change
    // Services are now dynamically determined based on what's missing
    useEffect(() => {
        if (selectedBackend && servicesToShow.length > 0) {
            // Add all missing services (they're required)
            const serviceIds = servicesToShow.map(s => s.id);
            setSelectedServices(prev => {
                const newSet = new Set(prev);
                serviceIds.forEach(service => newSet.add(service));
                return newSet;
            });
        } else if (selectedBackend && servicesToShow.length === 0) {
            // No services needed (e.g., ACCS backend or PaaS + ACO)
            // Clear services since backend/addons provide everything
            setSelectedServices(new Set());
        }
    }, [selectedBackend, servicesToShow, setSelectedServices]);

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
        servicesToShow,
    };
}
