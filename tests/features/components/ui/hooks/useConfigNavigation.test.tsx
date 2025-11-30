/**
 * useConfigNavigation Hook Tests
 *
 * Tests navigation state management, section completion calculations,
 * and field navigation functionality.
 */

import { renderHook, act } from '@testing-library/react';
import { useConfigNavigation } from '@/features/components/ui/hooks/useConfigNavigation';
import {
    testServiceGroups,
    emptyServiceGroups,
    fieldValues,
    completeFieldValues,
    createGetFieldValue,
    setupDOMElements,
    cleanupDOMElements,
} from './useConfigNavigation.testUtils';

describe('useConfigNavigation', () => {
    beforeEach(() => {
        cleanupDOMElements();
        jest.useFakeTimers();
    });

    afterEach(() => {
        cleanupDOMElements();
        jest.useRealTimers();
    });

    describe('initial state', () => {
        it('should initialize with empty expanded sections', () => {
            const { result } = renderHook(() =>
                useConfigNavigation({
                    serviceGroups: testServiceGroups,
                    isLoading: false,
                    getFieldValue: createGetFieldValue(fieldValues),
                })
            );

            expect(result.current.expandedNavSections.size).toBe(0);
        });

        it('should initialize with null active section and field', () => {
            const { result } = renderHook(() =>
                useConfigNavigation({
                    serviceGroups: testServiceGroups,
                    isLoading: false,
                    getFieldValue: createGetFieldValue(fieldValues),
                })
            );

            expect(result.current.activeSection).toBeNull();
            expect(result.current.activeField).toBeNull();
        });

        it('should not crash with empty service groups', () => {
            const { result } = renderHook(() =>
                useConfigNavigation({
                    serviceGroups: emptyServiceGroups,
                    isLoading: false,
                    getFieldValue: createGetFieldValue({}),
                })
            );

            expect(result.current.expandedNavSections.size).toBe(0);
        });
    });

    describe('getSectionCompletion', () => {
        it('should calculate completion for section with some fields filled', () => {
            const { result } = renderHook(() =>
                useConfigNavigation({
                    serviceGroups: testServiceGroups,
                    isLoading: false,
                    getFieldValue: createGetFieldValue(fieldValues),
                })
            );

            const completion = result.current.getSectionCompletion(testServiceGroups[0]);

            // Section 1 has 3 required fields: FIELD_1 (filled), FIELD_2 (empty), MESH_ENDPOINT (auto-complete)
            expect(completion.total).toBe(3); // Required: FIELD_1, FIELD_2, MESH_ENDPOINT
            expect(completion.completed).toBe(2); // FIELD_1 has value, MESH_ENDPOINT is auto-complete
            expect(completion.isComplete).toBe(false);
        });

        it('should treat MESH_ENDPOINT as always complete', () => {
            const valuesWithoutMesh = {
                FIELD_1: 'value1',
                FIELD_2: 'value2',
                MESH_ENDPOINT: '', // Empty but should count as complete
            };

            const { result } = renderHook(() =>
                useConfigNavigation({
                    serviceGroups: testServiceGroups,
                    isLoading: false,
                    getFieldValue: createGetFieldValue(valuesWithoutMesh),
                })
            );

            const completion = result.current.getSectionCompletion(testServiceGroups[0]);

            expect(completion.completed).toBe(3); // All 3 required fields complete
            expect(completion.isComplete).toBe(true);
        });

        it('should mark section complete when all required fields filled', () => {
            const { result } = renderHook(() =>
                useConfigNavigation({
                    serviceGroups: testServiceGroups,
                    isLoading: false,
                    getFieldValue: createGetFieldValue(completeFieldValues),
                })
            );

            const completion = result.current.getSectionCompletion(testServiceGroups[0]);

            expect(completion.isComplete).toBe(true);
        });

        it('should handle section with no required fields', () => {
            const noRequiredGroup = {
                id: 'no-required',
                name: 'No Required',
                fields: [
                    { key: 'OPT1', label: 'Optional 1', type: 'text' as const, required: false },
                    { key: 'OPT2', label: 'Optional 2', type: 'text' as const, required: false },
                ],
            };

            const { result } = renderHook(() =>
                useConfigNavigation({
                    serviceGroups: [noRequiredGroup],
                    isLoading: false,
                    getFieldValue: createGetFieldValue({}),
                })
            );

            const completion = result.current.getSectionCompletion(noRequiredGroup);

            expect(completion.total).toBe(0);
            expect(completion.completed).toBe(0);
            expect(completion.isComplete).toBe(true); // No required = complete
        });
    });

    describe('isFieldComplete', () => {
        it('should return true for field with value', () => {
            const { result } = renderHook(() =>
                useConfigNavigation({
                    serviceGroups: testServiceGroups,
                    isLoading: false,
                    getFieldValue: createGetFieldValue(fieldValues),
                })
            );

            const field = testServiceGroups[0].fields[0]; // FIELD_1 has value
            expect(result.current.isFieldComplete(field)).toBe(true);
        });

        it('should return false for field without value', () => {
            const { result } = renderHook(() =>
                useConfigNavigation({
                    serviceGroups: testServiceGroups,
                    isLoading: false,
                    getFieldValue: createGetFieldValue(fieldValues),
                })
            );

            const field = testServiceGroups[0].fields[1]; // FIELD_2 is empty
            expect(result.current.isFieldComplete(field)).toBe(false);
        });

        it('should always return true for MESH_ENDPOINT', () => {
            const { result } = renderHook(() =>
                useConfigNavigation({
                    serviceGroups: testServiceGroups,
                    isLoading: false,
                    getFieldValue: createGetFieldValue({}), // No values at all
                })
            );

            const meshField = testServiceGroups[0].fields[3]; // MESH_ENDPOINT
            expect(result.current.isFieldComplete(meshField)).toBe(true);
        });

        it('should return false for undefined value', () => {
            const { result } = renderHook(() =>
                useConfigNavigation({
                    serviceGroups: testServiceGroups,
                    isLoading: false,
                    getFieldValue: createGetFieldValue({}),
                })
            );

            const field = testServiceGroups[0].fields[0]; // No value defined
            expect(result.current.isFieldComplete(field)).toBe(false);
        });
    });

    describe('toggleNavSection', () => {
        it('should expand section when collapsed', () => {
            setupDOMElements(testServiceGroups);

            const { result } = renderHook(() =>
                useConfigNavigation({
                    serviceGroups: testServiceGroups,
                    isLoading: false,
                    getFieldValue: createGetFieldValue(fieldValues),
                })
            );

            act(() => {
                result.current.toggleNavSection('section-1');
            });

            expect(result.current.expandedNavSections.has('section-1')).toBe(true);
        });

        it('should collapse section when expanded', () => {
            setupDOMElements(testServiceGroups);

            const { result } = renderHook(() =>
                useConfigNavigation({
                    serviceGroups: testServiceGroups,
                    isLoading: false,
                    getFieldValue: createGetFieldValue(fieldValues),
                })
            );

            // Expand first
            act(() => {
                result.current.toggleNavSection('section-1');
            });

            expect(result.current.expandedNavSections.has('section-1')).toBe(true);

            // Collapse
            act(() => {
                result.current.toggleNavSection('section-1');
            });

            expect(result.current.expandedNavSections.has('section-1')).toBe(false);
        });

        it('should handle multiple sections independently', () => {
            setupDOMElements(testServiceGroups);

            const { result } = renderHook(() =>
                useConfigNavigation({
                    serviceGroups: testServiceGroups,
                    isLoading: false,
                    getFieldValue: createGetFieldValue(fieldValues),
                })
            );

            // Expand both sections
            act(() => {
                result.current.toggleNavSection('section-1');
            });
            act(() => {
                result.current.toggleNavSection('section-2');
            });

            expect(result.current.expandedNavSections.has('section-1')).toBe(true);
            expect(result.current.expandedNavSections.has('section-2')).toBe(true);

            // Collapse first
            act(() => {
                result.current.toggleNavSection('section-1');
            });

            expect(result.current.expandedNavSections.has('section-1')).toBe(false);
            expect(result.current.expandedNavSections.has('section-2')).toBe(true);
        });
    });

    describe('navigateToSection', () => {
        it('should scroll section element into view', () => {
            setupDOMElements(testServiceGroups);
            const sectionElement = document.getElementById('section-section-1');

            const { result } = renderHook(() =>
                useConfigNavigation({
                    serviceGroups: testServiceGroups,
                    isLoading: false,
                    getFieldValue: createGetFieldValue(fieldValues),
                })
            );

            act(() => {
                result.current.navigateToSection('section-1');
            });

            expect(sectionElement?.scrollIntoView).toHaveBeenCalledWith({
                behavior: 'smooth',
                block: 'start',
            });
        });

        it('should not throw for non-existent section', () => {
            const { result } = renderHook(() =>
                useConfigNavigation({
                    serviceGroups: testServiceGroups,
                    isLoading: false,
                    getFieldValue: createGetFieldValue(fieldValues),
                })
            );

            expect(() => {
                act(() => {
                    result.current.navigateToSection('non-existent');
                });
            }).not.toThrow();
        });
    });

    describe('navigateToField', () => {
        it('should focus input element within field', () => {
            setupDOMElements(testServiceGroups);
            const fieldWrapper = document.getElementById('field-FIELD_1');
            const input = fieldWrapper?.querySelector('input');

            const { result } = renderHook(() =>
                useConfigNavigation({
                    serviceGroups: testServiceGroups,
                    isLoading: false,
                    getFieldValue: createGetFieldValue(fieldValues),
                })
            );

            act(() => {
                result.current.navigateToField('FIELD_1');
            });

            expect(input?.focus).toHaveBeenCalled();
        });

        it('should not throw for non-existent field', () => {
            const { result } = renderHook(() =>
                useConfigNavigation({
                    serviceGroups: testServiceGroups,
                    isLoading: false,
                    getFieldValue: createGetFieldValue(fieldValues),
                })
            );

            expect(() => {
                act(() => {
                    result.current.navigateToField('non-existent');
                });
            }).not.toThrow();
        });
    });

    describe('when loading', () => {
        it('should not set up focus listeners when loading', () => {
            const addEventListenerSpy = jest.spyOn(document, 'querySelectorAll');

            renderHook(() =>
                useConfigNavigation({
                    serviceGroups: testServiceGroups,
                    isLoading: true,
                    getFieldValue: createGetFieldValue(fieldValues),
                })
            );

            // Should return early before querying for inputs
            expect(addEventListenerSpy).not.toHaveBeenCalled();

            addEventListenerSpy.mockRestore();
        });

        it('should not auto-focus first field when loading', () => {
            setupDOMElements(testServiceGroups);
            const firstInput = document.querySelector('#field-FIELD_1 input') as HTMLInputElement;

            renderHook(() =>
                useConfigNavigation({
                    serviceGroups: testServiceGroups,
                    isLoading: true,
                    getFieldValue: createGetFieldValue(fieldValues),
                })
            );

            // Run all timers
            act(() => {
                jest.runAllTimers();
            });

            // Should not focus when loading
            expect(firstInput?.focus).not.toHaveBeenCalled();
        });
    });

    describe('auto-focus on load', () => {
        it('should auto-focus first editable field after loading', () => {
            setupDOMElements(testServiceGroups);
            const firstInput = document.querySelector('#field-FIELD_1 input') as HTMLInputElement;

            renderHook(() =>
                useConfigNavigation({
                    serviceGroups: testServiceGroups,
                    isLoading: false,
                    getFieldValue: createGetFieldValue(fieldValues),
                })
            );

            // Run timers for the setTimeout in the hook
            act(() => {
                jest.runAllTimers();
            });

            expect(firstInput?.focus).toHaveBeenCalledWith({ preventScroll: true });
        });

        it('should skip MESH_ENDPOINT for auto-focus', () => {
            // Create service groups where MESH_ENDPOINT is first
            const meshFirstGroups = [
                {
                    id: 'mesh-first',
                    name: 'Mesh First',
                    fields: [
                        { key: 'MESH_ENDPOINT', label: 'Mesh Endpoint', type: 'text' as const, required: true },
                        { key: 'OTHER_FIELD', label: 'Other Field', type: 'text' as const, required: true },
                    ],
                },
            ];

            // Setup DOM with these groups
            cleanupDOMElements();
            meshFirstGroups.forEach(group => {
                const section = document.createElement('div');
                section.id = `section-${group.id}`;
                document.body.appendChild(section);

                group.fields.forEach(field => {
                    const wrapper = document.createElement('div');
                    wrapper.id = `field-${field.key}`;
                    const input = document.createElement('input');
                    input.focus = jest.fn();
                    wrapper.appendChild(input);
                    document.body.appendChild(wrapper);
                });
            });

            const otherFieldInput = document.querySelector('#field-OTHER_FIELD input') as HTMLInputElement;
            const meshFieldInput = document.querySelector('#field-MESH_ENDPOINT input') as HTMLInputElement;

            renderHook(() =>
                useConfigNavigation({
                    serviceGroups: meshFirstGroups,
                    isLoading: false,
                    getFieldValue: createGetFieldValue({}),
                })
            );

            act(() => {
                jest.runAllTimers();
            });

            // Should focus OTHER_FIELD, not MESH_ENDPOINT
            expect(otherFieldInput?.focus).toHaveBeenCalled();
            expect(meshFieldInput?.focus).not.toHaveBeenCalled();
        });

        it('should not auto-focus with empty service groups', () => {
            const { result } = renderHook(() =>
                useConfigNavigation({
                    serviceGroups: emptyServiceGroups,
                    isLoading: false,
                    getFieldValue: createGetFieldValue({}),
                })
            );

            act(() => {
                jest.runAllTimers();
            });

            // Just verify it doesn't crash
            expect(result.current.activeField).toBeNull();
        });
    });
});
