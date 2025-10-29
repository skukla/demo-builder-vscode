"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwoColumnLayout = void 0;
const react_1 = __importDefault(require("react"));
/**
 * Template Component: TwoColumnLayout
 *
 * Provides a consistent two-column layout pattern used across wizard steps
 * and configuration screens. Left column is constrained to 800px for
 * readability, right column is flexible.
 *
 * Used in:
 * - AdobeProjectStep (selection + summary)
 * - AdobeWorkspaceStep (selection + summary)
 * - ConfigureScreen (form + summary)
 *
 * @example
 * ```tsx
 * <TwoColumnLayout
 *   leftContent={<ProjectList />}
 *   rightContent={<ConfigurationSummary />}
 * />
 * ```
 */
const TwoColumnLayout = ({ leftContent, rightContent, leftMaxWidth = '800px', leftPadding = '24px', rightPadding = '24px', rightBackgroundColor = 'var(--spectrum-global-color-gray-75)', showBorder = true, gap = '0', className }) => {
    return (react_1.default.createElement("div", { style: {
            display: 'flex',
            height: '100%',
            width: '100%',
            gap
        }, className: className },
        react_1.default.createElement("div", { style: {
                maxWidth: leftMaxWidth,
                width: '100%',
                padding: leftPadding,
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0 // Prevent flex shrinking issues
            } }, leftContent),
        react_1.default.createElement("div", { style: {
                flex: '1',
                padding: rightPadding,
                backgroundColor: rightBackgroundColor,
                borderLeft: showBorder
                    ? '1px solid var(--spectrum-global-color-gray-200)'
                    : undefined
            } }, rightContent)));
};
exports.TwoColumnLayout = TwoColumnLayout;
//# sourceMappingURL=TwoColumnLayout.js.map