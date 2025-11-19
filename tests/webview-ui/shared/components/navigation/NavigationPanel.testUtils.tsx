import { NavigationField, NavigationSection } from '@/core/ui/components/navigation/NavigationPanel';

/**
 * Factory function for creating mock navigation fields
 * Returns a function to ensure fresh data for each test
 */
export const createMockFields = (): NavigationField[] => [
    { key: 'field1', label: 'Field 1', isComplete: true },
    { key: 'field2', label: 'Field 2', isComplete: false },
    { key: 'field3', label: 'Field 3', isComplete: true }
];

/**
 * Factory function for creating mock navigation sections
 * Returns a function to ensure fresh data for each test
 */
export const createMockSections = (): NavigationSection[] => [
    {
        id: 'section1',
        label: 'Adobe Commerce',
        fields: createMockFields(),
        isComplete: false,
        completedCount: 2,
        totalCount: 3
    },
    {
        id: 'section2',
        label: 'API Mesh',
        fields: [
            { key: 'mesh1', label: 'Mesh Field 1', isComplete: true }
        ],
        isComplete: true,
        completedCount: 1,
        totalCount: 1
    }
];
