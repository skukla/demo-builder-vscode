/**
 * Aria Primitives Barrel
 *
 * Re-exports primitive components: Text, Heading, Flex, View, Divider, List
 * These are simple content/layout components with no interactivity.
 *
 * All components support:
 * - CSS Module styling (zero !important)
 * - React.forwardRef for ref forwarding
 * - Spectrum-compatible props (className, style)
 * - Spectrum design tokens for dimension props
 */

export { Text } from './Text';
export type { TextProps } from './Text';

export { Heading } from './Heading';
export type { HeadingProps } from './Heading';

export { Flex } from './Flex';
export type { FlexProps } from './Flex';

export { View } from './View';
export type { ViewProps } from './View';

export { Divider } from './Divider';
export type { DividerProps } from './Divider';

export { List, ListItem } from './List';
export type { ListProps, ListItemProps, SelectionMode } from './List';
