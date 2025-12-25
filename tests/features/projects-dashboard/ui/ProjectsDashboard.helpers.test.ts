/**
 * ProjectsDashboard Helper Tests
 *
 * Tests for buildMenuItems helper that extracts the conditional menu building logic
 * from the ProjectsDashboard component.
 *
 * Follows TDD methodology - tests written BEFORE implementation.
 */

import { buildMenuItems, type MenuItem } from '@/features/projects-dashboard/ui/projectsDashboardHelpers';

describe('projectsDashboardHelpers', () => {
    describe('buildMenuItems', () => {
        describe('base menu item', () => {
            it('should always include "New Project" menu item', () => {
                // Given: No optional callbacks
                const callbacks = {
                    onCopyFromExisting: undefined,
                    onImportFromFile: undefined,
                };

                // When: Building menu items
                const result = buildMenuItems(callbacks);

                // Then: Should have only the New Project item
                expect(result).toHaveLength(1);
                expect(result[0]).toEqual({
                    key: 'new',
                    label: 'New Project',
                    icon: 'add',
                });
            });

            it('should place "New Project" as the first item', () => {
                // Given: All optional callbacks provided
                const callbacks = {
                    onCopyFromExisting: jest.fn(),
                    onImportFromFile: jest.fn(),
                };

                // When: Building menu items
                const result = buildMenuItems(callbacks);

                // Then: New Project should be first
                expect(result[0].key).toBe('new');
            });
        });

        describe('copy from existing option', () => {
            it('should include "Copy from Existing" when callback is provided', () => {
                // Given: onCopyFromExisting callback is provided
                const callbacks = {
                    onCopyFromExisting: jest.fn(),
                    onImportFromFile: undefined,
                };

                // When: Building menu items
                const result = buildMenuItems(callbacks);

                // Then: Should include Copy from Existing item
                expect(result).toHaveLength(2);
                expect(result[1]).toEqual({
                    key: 'copy',
                    label: 'Copy from Existing...',
                    icon: 'copy',
                });
            });

            it('should NOT include "Copy from Existing" when callback is undefined', () => {
                // Given: onCopyFromExisting is undefined
                const callbacks = {
                    onCopyFromExisting: undefined,
                    onImportFromFile: undefined,
                };

                // When: Building menu items
                const result = buildMenuItems(callbacks);

                // Then: Should NOT include Copy from Existing item
                const copyItem = result.find((item) => item.key === 'copy');
                expect(copyItem).toBeUndefined();
            });

            it('should NOT include "Copy from Existing" when callback is null', () => {
                // Given: onCopyFromExisting is null
                const callbacks = {
                    onCopyFromExisting: null as unknown as (() => void) | undefined,
                    onImportFromFile: undefined,
                };

                // When: Building menu items
                const result = buildMenuItems(callbacks);

                // Then: Should NOT include Copy from Existing item
                const copyItem = result.find((item) => item.key === 'copy');
                expect(copyItem).toBeUndefined();
            });
        });

        describe('import from file option', () => {
            it('should include "Import from File" when callback is provided', () => {
                // Given: onImportFromFile callback is provided
                const callbacks = {
                    onCopyFromExisting: undefined,
                    onImportFromFile: jest.fn(),
                };

                // When: Building menu items
                const result = buildMenuItems(callbacks);

                // Then: Should include Import from File item
                expect(result).toHaveLength(2);
                expect(result[1]).toEqual({
                    key: 'import',
                    label: 'Import from File...',
                    icon: 'import',
                });
            });

            it('should NOT include "Import from File" when callback is undefined', () => {
                // Given: onImportFromFile is undefined
                const callbacks = {
                    onCopyFromExisting: undefined,
                    onImportFromFile: undefined,
                };

                // When: Building menu items
                const result = buildMenuItems(callbacks);

                // Then: Should NOT include Import from File item
                const importItem = result.find((item) => item.key === 'import');
                expect(importItem).toBeUndefined();
            });
        });

        describe('all options combined', () => {
            it('should include all items when both callbacks are provided', () => {
                // Given: All callbacks provided
                const callbacks = {
                    onCopyFromExisting: jest.fn(),
                    onImportFromFile: jest.fn(),
                };

                // When: Building menu items
                const result = buildMenuItems(callbacks);

                // Then: Should include all three items in correct order
                expect(result).toHaveLength(3);
                expect(result[0].key).toBe('new');
                expect(result[1].key).toBe('copy');
                expect(result[2].key).toBe('import');
            });

            it('should maintain consistent order: new, copy, import', () => {
                // Given: All callbacks provided
                const callbacks = {
                    onCopyFromExisting: jest.fn(),
                    onImportFromFile: jest.fn(),
                };

                // When: Building menu items
                const result = buildMenuItems(callbacks);

                // Then: Order should always be new, copy, import
                expect(result.map((item) => item.key)).toEqual(['new', 'copy', 'import']);
            });
        });

        describe('return type integrity', () => {
            it('should return MenuItem array with required properties', () => {
                // Given: Any callback configuration
                const callbacks = {
                    onCopyFromExisting: jest.fn(),
                    onImportFromFile: jest.fn(),
                };

                // When: Building menu items
                const result = buildMenuItems(callbacks);

                // Then: Each item should have key, label, and icon
                result.forEach((item: MenuItem) => {
                    expect(item).toHaveProperty('key');
                    expect(item).toHaveProperty('label');
                    expect(item).toHaveProperty('icon');
                    expect(typeof item.key).toBe('string');
                    expect(typeof item.label).toBe('string');
                    expect(typeof item.icon).toBe('string');
                });
            });

            it('should return new array instance each call', () => {
                // Given: Same callback configuration
                const callbacks = {
                    onCopyFromExisting: jest.fn(),
                    onImportFromFile: undefined,
                };

                // When: Building menu items multiple times
                const result1 = buildMenuItems(callbacks);
                const result2 = buildMenuItems(callbacks);

                // Then: Should return different array instances
                expect(result1).not.toBe(result2);
                expect(result1).toEqual(result2);
            });
        });
    });
});
