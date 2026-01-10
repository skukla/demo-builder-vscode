/**
 * Mock for @spectrum-icons/workflow
 *
 * Returns a simple icon stub component for any icon import.
 * This prevents loading the full icon library in tests.
 */
import React from 'react';

// Generic icon component that works for all workflow icons
// Uses SVG to match what tests expect when querying for svg elements
const createIconMock = (name: string) => {
    const IconComponent: React.FC<any> = ({ size, UNSAFE_className, ...props }) => (
        <svg
            data-testid={`spectrum-icon-${name.toLowerCase()}`}
            data-icon={name}
            data-size={size}
            className={UNSAFE_className}
            role="img"
            aria-hidden="true"
            width={size === 'S' ? 16 : size === 'L' ? 24 : 20}
            height={size === 'S' ? 16 : size === 'L' ? 24 : 20}
            viewBox="0 0 24 24"
            {...props}
        >
            <title>{name}</title>
        </svg>
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
export const InfoOutline = createIconMock('InfoOutline');
export const Info = createIconMock('Info');
export const Help = createIconMock('Help');
export const Question = createIconMock('Question');
export const Alert = createIconMock('Alert');
export const Warning = createIconMock('Warning');
export const Error = createIconMock('Error');
export const Success = createIconMock('Success');
export const Copy = createIconMock('Copy');
export const Cut = createIconMock('Cut');
export const Paste = createIconMock('Paste');
export const Link = createIconMock('Link');
export const Unlink = createIconMock('Unlink');
export const Download = createIconMock('Download');
export const Upload = createIconMock('Upload');
export const Home = createIconMock('Home');
export const Back = createIconMock('Back');
export const Forward = createIconMock('Forward');

// Default export for direct icon imports like:
// import LockClosed from '@spectrum-icons/workflow/LockClosed'
export default createIconMock('DefaultIcon');
