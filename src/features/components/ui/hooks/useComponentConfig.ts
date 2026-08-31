import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { vscode } from '@/core/ui/utils/vscode-api';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import { url, pattern, normalizeUrl } from '@/core/validation/Validator';
import { PAAS_URL, PAAS_GRAPHQL_ENDPOINT } from '@/core/config/envVarKeys';
import {
    findFieldValue,
    resolveWriteTargets,
    writeFieldValue,
    writeToComponents,
} from '@/features/components/services/componentConfigWrites';
import { getStackById } from '@/features/components/services/demoPackageLoader';
import { deriveGraphqlEndpoint } from '@/features/components/services/envVarHelpers';
import {
    toServiceGroupWithSortedFields,
    SERVICE_GROUP_DEFINITIONS,
} from '@/features/components/services/serviceGroupTransforms';
import { collectStackComponents } from '@/features/components/services/stackComponentCollector';
import type { EnvVarDefinition } from '@/types/components';
import { ComponentConfigs } from '@/types/webview';
import type { ComponentDataDTO, ComponentsDataPayload, GetComponentsDataResponse } from '@/types/webviewRequests';

const log = webviewLogger('useComponentConfig');

// Create validators with consistent error messages
const urlValidator = url('Please enter a valid URL');

// The wire shape lives in @/types/webviewRequests — ONE declaration shared
// with the get-components-data handler. This hook used to carry three local
// twins: a ComponentData view, a ServiceDefinition that re-declared the
// phantom required `id` the canonical type had already shed, and a
// ComponentsData with an `appBuilder` section the response never includes.
type ComponentsData = ComponentsDataPayload;

export interface UniqueField extends EnvVarDefinition {
    componentIds: string[];
}

export interface ServiceGroup {
    id: string;
    label: string;
    fields: UniqueField[];
}

export interface UseComponentConfigProps {
    selectedStack?: string;
    componentConfigs: ComponentConfigs;
    packageConfigDefaults?: Record<string, string>;
    onConfigsChange: (configs: ComponentConfigs) => void;
    onValidationChange: (allValid: boolean) => void;
}

interface UseComponentConfigReturn {
    componentConfigs: ComponentConfigs;
    isLoading: boolean;
    loadError: string | null;
    serviceGroups: ServiceGroup[];
    validationErrors: Record<string, string>;
    touchedFields: Set<string>;
    updateField: (field: UniqueField, value: string | boolean) => void;
    getFieldValue: (field: UniqueField) => string | boolean | undefined;
    /** Normalize URL field on blur (removes trailing slashes for visual feedback) */
    normalizeUrlField: (field: UniqueField) => void;
}

// Service group definitions imported from shared source (serviceGroupTransforms.ts)
// Note: 'mesh' group exists in shared list for Configure screen; wizard filters MESH_ENDPOINT
// so the mesh group will be empty and hidden via `.filter(group => group.fields.length > 0)`

/**
 * The component registry, fetched once per webview.
 *
 * `get-components-data` is a pure read of bundled registry JSON
 * (`componentHandlers.handleGetComponentsData`) — the same bytes on every call,
 * for the life of the webview. It was fetched on every MOUNT of this hook, and
 * the Commerce area remounts its whole body on each sub-step change
 * (`StepAreaShell viewKey`, which is how the crossfade is implemented). So
 * stepping Business Structure → Catalog tore down the loaded config, restarted
 * the request, and flashed "Loading component configurations..." for data that
 * had not changed and did not need fetching. Reported 2026-08-20.
 *
 * The in-flight promise is cached too, so two hooks mounting in the same frame
 * share one request instead of racing.
 *
 * Nothing invalidates this, because nothing can: the registry ships with the
 * extension, so a change to it means a new extension build, which reloads the
 * webview and takes this module with it.
 */
let registryCache: ComponentsData | undefined;
let registryInFlight: Promise<ComponentsData> | undefined;

/**
 * Drop the cached registry.
 *
 * For TESTS. Module state outlives a single `renderHook`, so without this the
 * first test in a file warms the cache and every later mount starts already
 * loaded — which silently changes what those tests are asserting. Production has
 * no caller and wants none: the cache is meant to live as long as the webview.
 */
export function resetComponentRegistryCache(): void {
    registryCache = undefined;
    registryInFlight = undefined;
}

/**
 * Apply field defaults and brand-specific package defaults to component configs.
 *
 * Writes through `writeToComponents`, so `prevConfigs` and every per-component object
 * inside it are left untouched — the caller's object is not rewritten in place.
 */
function applyFieldDefaults(
    prevConfigs: ComponentConfigs,
    groups: ServiceGroup[],
    packageConfigDefaults: Record<string, string> | undefined,
    backendId: string | undefined,
): ComponentConfigs {
    let newConfigs = prevConfigs;
    let hasChanges = false;
    const packageDefaults = packageConfigDefaults || {};

    groups.forEach((group) => {
        group.fields.forEach((field) => {
            const packageValue = packageDefaults[field.key];
            const defaultValue = packageValue ?? field.default;
            if (defaultValue === undefined || defaultValue === '') return;

            // Both package and field defaults only fill a BLANK — neither may override
            // a stored value. Package defaults used to override, which stomped the
            // user's saved Business Structure scope (e.g. their selected website) back
            // to the brand's codes every time the wizard loaded a project (2026-08-13,
            // leah-b2b-demo). Restamping brand codes on a real package SWITCH is
            // WelcomeStep's handlePackageSelect, which clears the old package's keys
            // so this fill applies the new ones. The blank check is per component
            // because STORAGE is per component — not because divergent values are
            // wanted. Every write path fans one field's value to all its components,
            // so two copies disagreeing is a defect, never a feature (see
            // resolveWriteTargets).
            const targets = resolveWriteTargets(field, backendId).filter(
                (componentId) => !newConfigs[componentId]?.[field.key],
            );
            if (targets.length === 0) return;

            newConfigs = writeToComponents(newConfigs, targets, { [field.key]: defaultValue });
            hasChanges = true;
        });
    });

    return hasChanges ? newConfigs : prevConfigs;
}

export function useComponentConfig({
    selectedStack,
    componentConfigs: initialConfigs,
    packageConfigDefaults,
    onConfigsChange,
    onValidationChange,
}: UseComponentConfigProps): UseComponentConfigReturn {
    const [componentConfigs, setComponentConfigs] = useState<ComponentConfigs>(
        initialConfigs || {},
    );
    const [hasInitializedFromState, setHasInitializedFromState] = useState(false);
    // Seeded from the cache, so a remount with the registry already in hand
    // renders the form immediately instead of flashing a loader.
    const [componentsData, setComponentsData] = useState<Partial<ComponentsData>>(
        registryCache ?? {},
    );

    // The backend owns the store-scope keys, so those writes land only there
    // (`resolveWriteTargets`). Every other field still writes to each component
    // that declares it.
    const backendId = selectedStack ? getStackById(selectedStack)?.backend : undefined;
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(registryCache === undefined);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Stable refs for callbacks to avoid re-render loops in effects
    const onConfigsChangeRef = useRef(onConfigsChange);
    onConfigsChangeRef.current = onConfigsChange;
    const onValidationChangeRef = useRef(onValidationChange);
    onValidationChangeRef.current = onValidationChange;

    // Sync imported configs from props (handles case where configs arrive after first render)
    useEffect(() => {
        if (!hasInitializedFromState && initialConfigs && Object.keys(initialConfigs).length > 0) {
            log.info('Syncing componentConfigs from props', {
                configKeys: Object.keys(initialConfigs),
            });
            setComponentConfigs((prev) => {
                // Merge: incoming configs take priority, but preserve any user edits
                const merged = { ...initialConfigs };
                // Keep any keys that exist in prev but not in incoming (user edits)
                for (const key of Object.keys(prev)) {
                    if (!merged[key]) {
                        merged[key] = prev[key];
                    }
                }
                return merged;
            });
            setHasInitializedFromState(true);
        }
    }, [initialConfigs, hasInitializedFromState]);

    // Load components data
    useEffect(() => {
        if (registryCache !== undefined) {
            return;
        }
        let cancelled = false;
        const loadData = async () => {
            try {
                registryInFlight ??= vscode
                    .request<GetComponentsDataResponse>('get-components-data')
                    .then((response) => response.data);
                const data = await registryInFlight;
                registryCache = data;
                if (cancelled) return;
                setComponentsData(data);
                setIsLoading(false);
            } catch (error) {
                // Clear the shared promise so a retry is not permanently poisoned
                // by one failure.
                registryInFlight = undefined;
                log.error('Failed to load components:', error);
                if (cancelled) return;
                setLoadError('Failed to load component configuration. Please try again.');
                setIsLoading(false);
            }
        };
        loadData();
        return () => {
            cancelled = true;
        };
    }, []);

    // Build selected components with dependencies.
    // The collection rule (and the three-way dependency walk) lives in
    // `stackComponentCollector` — it is pure, and inside this hook it was both
    // written out three times and unreachable by tests.
    const selectedComponents = useMemo(
        () =>
            collectStackComponents<ComponentDataDTO>(
                selectedStack ? getStackById(selectedStack) : undefined,
                componentsData,
            ),
        [selectedStack, componentsData],
    );

    // Build service groups from selected components
    const serviceGroups = useMemo(() => {
        const fieldMap = new Map<string, UniqueField>();
        const envVarDefs = componentsData.envVars || {};
        const stack = selectedStack ? getStackById(selectedStack) : undefined;

        selectedComponents.forEach(({ id, data }) => {
            const addField = (envVarKey: string) => {
                // Skip MESH_ENDPOINT - auto-configured during project creation
                if (envVarKey === 'MESH_ENDPOINT') return;

                const envVarDef = envVarDefs[envVarKey];
                if (envVarDef) {
                    if (!fieldMap.has(envVarKey)) {
                        fieldMap.set(envVarKey, {
                            ...envVarDef,
                            key: envVarKey,
                            componentIds: [id],
                        });
                    } else {
                        const existing = fieldMap.get(envVarKey);
                        if (existing && !existing.componentIds.includes(id)) {
                            existing.componentIds.push(id);
                        }
                    }
                }
            };

            // Use centralized env var resolution (includes component vars + service vars)
            // Note: Can't use resolveComponentEnvVars() here directly because we're in browser context
            // and need to use componentsData (loaded via vscode.request), not ComponentRegistryManager

            // Add component's own env vars
            data.configuration?.requiredEnvVars?.forEach(addField);
            data.configuration?.optionalEnvVars?.forEach(addField);

            // Add backend-specific service env vars using inline resolution
            // (This logic mirrors resolveComponentEnvVars but uses browser-loaded componentsData)
            if (data.configuration?.requiredServices && stack?.backend) {
                const backendId = stack.backend;
                data.configuration.requiredServices.forEach((serviceId) => {
                    const serviceDef = componentsData.services?.[serviceId];
                    if (serviceDef?.backendSpecific && serviceDef.requiredEnvVarsByBackend) {
                        const backendSpecificVars = serviceDef.requiredEnvVarsByBackend[backendId];
                        if (backendSpecificVars) {
                            backendSpecificVars.forEach(addField);
                        }
                    } else if (serviceDef?.requiredEnvVars) {
                        serviceDef.requiredEnvVars.forEach(addField);
                    }
                });
            }
        });

        const groups: Record<string, UniqueField[]> = {};
        fieldMap.forEach((field) => {
            const metadata = field as UniqueField & { group?: string };
            const groupKey = metadata.group || 'other';
            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(field);
        });

        return SERVICE_GROUP_DEFINITIONS.map((def) => toServiceGroupWithSortedFields(def, groups))
            .filter((group) => group.fields.length > 0)
            .sort((a, b) => {
                const aOrder = SERVICE_GROUP_DEFINITIONS.find((d) => d.id === a.id)?.order || 99;
                const bOrder = SERVICE_GROUP_DEFINITIONS.find((d) => d.id === b.id)?.order || 99;
                return aOrder - bOrder;
            });
    }, [selectedComponents, componentsData.envVars, componentsData.services, selectedStack]);

    // Initialize defaults (field defaults + brand-specific defaults)
    useEffect(() => {
        if (serviceGroups.length === 0) return;

        setComponentConfigs((prevConfigs) =>
            applyFieldDefaults(prevConfigs, serviceGroups, packageConfigDefaults, backendId),
        );
    }, [serviceGroups, packageConfigDefaults, backendId]);

    // Note: Auto-fill mesh endpoint effect removed - MESH_ENDPOINT is now auto-configured
    // during project creation (after mesh deployment), not collected in Settings Collection

    // Validation
    useEffect(() => {
        onConfigsChangeRef.current(componentConfigs);

        let allValid = true;
        const errors: Record<string, string> = {};

        serviceGroups.forEach((group) => {
            group.fields.forEach((field) => {
                // Note: MESH_ENDPOINT deferred field check removed - field is now filtered out entirely
                // (auto-configured during project creation)

                // `findFieldValue` treats undefined and '' as absent and everything else
                // as present. A bare truthiness check used to sit here, which made a
                // field holding `false` or `0` read as "required but missing" — an error
                // the user could not clear, because the checkbox IS ticked. No env var
                // declares a boolean today, but ConfigFieldRenderer's `case 'boolean'`
                // writes real booleans, so the trap was armed.
                const value = findFieldValue(componentConfigs, field);
                const hasValue = value !== undefined;

                if (field.required && !hasValue) {
                    allValid = false;
                    errors[field.key] = `${field.label} is required`;
                }

                // Format checks only apply to a real string — a boolean or a number has
                // no URL or pattern to fail.
                if (typeof value !== 'string') return;

                // URL validation using core validator
                if (field.type === 'url') {
                    const result = urlValidator(value);
                    if (!result.valid && result.error) {
                        allValid = false;
                        errors[field.key] = result.error;
                    }
                }

                // Pattern validation using core validator
                if (field.validation?.pattern) {
                    const patternValidator = pattern(
                        new RegExp(field.validation.pattern),
                        field.validation.message || 'Invalid format',
                    );
                    const result = patternValidator(value);
                    if (!result.valid && result.error) {
                        allValid = false;
                        errors[field.key] = result.error;
                    }
                }
            });
        });

        setValidationErrors(errors);
        onValidationChangeRef.current(allValid);
    }, [componentConfigs, serviceGroups]);

    const updateField = useCallback(
        (field: UniqueField, value: string | boolean) => {
            setTouchedFields((prev) => new Set(prev).add(field.key));
            setComponentConfigs((prev) => {
                const writes: Record<string, string | boolean> = { [field.key]: value };

                // Linked field: PAAS_URL → PAAS_GRAPHQL_ENDPOINT
                // Only auto-derive if GraphQL hasn't been manually touched
                if (field.key === PAAS_URL && typeof value === 'string') {
                    if (!touchedFields.has(PAAS_GRAPHQL_ENDPOINT)) {
                        writes[PAAS_GRAPHQL_ENDPOINT] = deriveGraphqlEndpoint(value);
                    }
                }

                return writeToComponents(prev, resolveWriteTargets(field, backendId), writes);
            });
        },
        [touchedFields, backendId],
    );

    const getFieldValue = useCallback(
        (field: UniqueField): string | boolean | undefined => {
            for (const componentId of field.componentIds) {
                const value = componentConfigs[componentId]?.[field.key];
                if (value !== undefined && value !== '') {
                    return typeof value === 'number' ? String(value) : value;
                }
            }
            // If user explicitly cleared this field (touched + empty), respect their intent
            // Don't fall back to default when user deliberately cleared the value
            if (touchedFields.has(field.key)) {
                return '';
            }
            if (field.default !== undefined && field.default !== '') {
                // Same numeric handling as stored values above — the registry
                // type allows numeric defaults even though none exist today.
                return typeof field.default === 'number' ? String(field.default) : field.default;
            }
            return '';
        },
        [componentConfigs, touchedFields],
    );

    /**
     * Normalize URL field on blur - removes trailing slashes for visual feedback.
     * Called when user leaves a URL field to show normalized value.
     */
    const normalizeUrlField = useCallback(
        (field: UniqueField) => {
            if (field.type !== 'url') return;

            const currentValue = findFieldValue(componentConfigs, field);
            if (typeof currentValue !== 'string' || !currentValue) return;

            // Normalize and update if changed
            const normalized = normalizeUrl(currentValue);
            if (normalized !== currentValue) {
                setComponentConfigs((prev) => writeFieldValue(prev, field, normalized));
            }
        },
        [componentConfigs],
    );

    return {
        componentConfigs,
        isLoading,
        loadError,
        serviceGroups,
        validationErrors,
        touchedFields,
        updateField,
        getFieldValue,
        normalizeUrlField,
    };
}
