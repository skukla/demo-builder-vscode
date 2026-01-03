/**
 * Aria Overlays Barrel
 *
 * Re-exports overlay components: Dialog, Menu, Tooltip
 * These are components that display content above the main interface.
 * CSS Modules for styling - zero !important declarations.
 */

export { Dialog, DialogTrigger, useDialogContext } from './Dialog';
export type { DialogProps, DialogTriggerProps, DialogAction, DialogSize, DialogContextValue } from './Dialog';

export { DialogHeader, DialogContent, DialogFooter } from './DialogSlots';
export type { DialogSlotProps } from './DialogSlots';

export { Menu, MenuItem, MenuSeparator, MenuTrigger } from './Menu';
export type { MenuProps, MenuItemProps, MenuItemData, MenuTriggerProps } from './Menu';

export { Tooltip, TooltipTrigger } from './Tooltip';
export type { TooltipProps, TooltipTriggerProps, TooltipPlacement } from './Tooltip';
