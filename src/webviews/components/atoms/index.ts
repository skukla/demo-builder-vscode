/**
 * Atomic Design - Atoms
 *
 * Atoms are the smallest building blocks of the UI.
 * They are simple, single-purpose components that cannot be broken down further.
 *
 * Examples: Button, Icon, Badge, Spinner, StatusDot, Tag
 */

export { Badge } from './Badge';
export type { BadgeProps, BadgeVariant } from './Badge';

export { Icon } from './Icon';
export type { IconProps, IconSize } from './Icon';

export { Spinner } from './Spinner';
export type { SpinnerProps } from './Spinner';

export { StatusDot } from './StatusDot';
export type { StatusDotProps, StatusDotVariant } from './StatusDot';

export { Tag } from './Tag';
export type { TagProps } from './Tag';

export { Transition } from './Transition';
export type { TransitionProps } from './Transition';
