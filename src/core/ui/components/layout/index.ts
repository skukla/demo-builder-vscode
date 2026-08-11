/**
 * Layout Components
 *
 * Layout and structural components (grids, columns, etc.)
 * These define page structure and organization.
 *
 * Migration from atomic design: templates/ → layout/
 */

export { TwoColumnLayout } from './TwoColumnLayout';
export type { TwoColumnLayoutProps } from './TwoColumnLayout';

export { GridLayout } from './GridLayout';
export type { GridLayoutProps } from './GridLayout';

export { PageHeader } from './PageHeader';
export type { PageHeaderProps, BackButtonConfig } from './PageHeader';

export { PageFooter } from './PageFooter';
export type { PageFooterProps } from './PageFooter';

export { PageLayout } from './PageLayout';
export type { PageLayoutProps } from './PageLayout';

export { CenteredFeedbackContainer } from './CenteredFeedbackContainer';
export type { CenteredFeedbackContainerProps } from './CenteredFeedbackContainer';

export { SingleColumnLayout } from './SingleColumnLayout';
export type { SingleColumnLayoutProps } from './SingleColumnLayout';

export { ContentColumn } from './ContentColumn';
export type { ContentColumnProps } from './ContentColumn';

export { ContentWithSidebar } from './ContentWithSidebar';
export type { ContentWithSidebarProps } from './ContentWithSidebar';

export { ControlPanelLayout } from './ControlPanelLayout';
export type { ControlPanelLayoutProps } from './ControlPanelLayout';

// StepAreaShell is deliberately NOT re-exported here: its consumers import it by direct
// path, because several suites mock this whole barrel to stub PageHeader/PageFooter and
// a barrel import would hand them an undefined shell.
