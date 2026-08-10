/**
 * Navigation Components
 *
 * Components for navigation, search, and list management.
 * These help users find and select items.
 *
 * Migration from atomic design: organisms/ → navigation/
 */

export { SearchHeader } from './SearchHeader';
export type { SearchHeaderProps, ViewMode } from './SearchHeader';

export { SearchableList } from './SearchableList';
export type { SearchableListProps, SearchableListItem } from './SearchableList';

export { BackButton } from './BackButton';
export type { BackButtonProps } from './BackButton';

// StepRail is deliberately NOT re-exported here — same reason as StepAreaShell in the
// layout barrel: its consumers import it by direct path so a barrel mock cannot blank it.
