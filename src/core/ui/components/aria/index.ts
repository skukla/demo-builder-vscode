/**
 * React Aria Components - Main Barrel
 *
 * Centralized exports for all React Aria component wrappers.
 * This module provides styled, accessible components that replace
 * React Spectrum components without inline styles.
 *
 * Directory Structure:
 * - primitives/ - Text, Heading, View, Flex, Divider, List/ListItem
 * - interactive/ - Button, ActionButton, ProgressCircle
 * - forms/ - TextField, SearchField, Checkbox, Select, ProgressBar, RadioGroup/Radio
 * - overlays/ - Dialog, Menu, Tooltip/TooltipTrigger
 *
 * Migration Plan:
 * Components are migrated incrementally from React Spectrum.
 * Import from this barrel for new components; existing Spectrum
 * imports remain unchanged until individually migrated.
 */

// Re-export all component categories
export * from './primitives';
export * from './interactive';
export * from './forms';
export * from './overlays';
