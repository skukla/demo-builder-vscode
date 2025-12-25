/**
 * ProjectsDashboard Helpers
 *
 * Utility functions for the ProjectsDashboard component, extracted to improve
 * testability and reduce inline complexity in JSX.
 */

/**
 * Menu item structure for the New Project dropdown menu.
 */
export interface MenuItem {
    key: string;
    label: string;
    icon: string;
}

/**
 * Callback options for building menu items.
 */
export interface MenuCallbacks {
    onCopyFromExisting?: (() => void) | null;
    onImportFromFile?: (() => void) | null;
}

/**
 * Builds the menu items array for the New Project dropdown.
 *
 * Always includes "New Project" as the first item. Conditionally includes
 * "Copy from Existing..." and "Import from File..." based on provided callbacks.
 *
 * @param callbacks - Object containing optional callback functions
 * @returns Array of menu items with key, label, and icon properties
 */
export function buildMenuItems(callbacks: MenuCallbacks): MenuItem[] {
    const items: MenuItem[] = [
        { key: 'new', label: 'New Project', icon: 'add' },
    ];

    if (callbacks.onCopyFromExisting) {
        items.push({ key: 'copy', label: 'Copy from Existing...', icon: 'copy' });
    }

    if (callbacks.onImportFromFile) {
        items.push({ key: 'import', label: 'Import from File...', icon: 'import' });
    }

    return items;
}
