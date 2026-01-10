/**
 * Mock for @spectrum-icons/workflow
 *
 * Returns a simple icon stub component for any icon import.
 * This prevents loading the full icon library in tests.
 */
import React from 'react';

// Generic icon component that works for all workflow icons
const createIconMock = (name: string) => {
    const IconComponent: React.FC<any> = ({ size, ...props }) => (
        <span
            data-testid={`spectrum-icon-${name.toLowerCase()}`}
            data-icon={name}
            data-size={size}
            role="img"
            aria-hidden="true"
            {...props}
        >
            [{name}]
        </span>
    );
    IconComponent.displayName = name;
    return IconComponent;
};

// Export common icons used in the codebase
export const LockClosed = createIconMock('LockClosed');
export const Add = createIconMock('Add');
export const Close = createIconMock('Close');
export const Edit = createIconMock('Edit');
export const Delete = createIconMock('Delete');
export const Refresh = createIconMock('Refresh');
export const Settings = createIconMock('Settings');
export const Play = createIconMock('Play');
export const Stop = createIconMock('Stop');
export const CheckmarkCircle = createIconMock('CheckmarkCircle');
export const AlertCircle = createIconMock('AlertCircle');
export const InfoCircle = createIconMock('InfoCircle');
export const Clock = createIconMock('Clock');
export const Folder = createIconMock('Folder');
export const Document = createIconMock('Document');
export const User = createIconMock('User');
export const Search = createIconMock('Search');
export const ChevronRight = createIconMock('ChevronRight');
export const ChevronDown = createIconMock('ChevronDown');
export const ChevronLeft = createIconMock('ChevronLeft');
export const ChevronUp = createIconMock('ChevronUp');

// Default export for direct icon imports like:
// import LockClosed from '@spectrum-icons/workflow/LockClosed'
export default createIconMock('DefaultIcon');
