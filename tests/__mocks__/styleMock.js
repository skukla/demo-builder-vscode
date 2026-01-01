// Mock for CSS imports in tests
// Uses Proxy to return the class name as-is for CSS Modules
// e.g., styles.projectsGrid returns 'projectsGrid'

// Create a proxy that returns property names as class names
const createStyleProxy = () => {
  return new Proxy(
    {},
    {
      get: function (_target, key) {
        // Return the property name as the class name string
        if (typeof key === 'string') {
          return key;
        }
        return undefined;
      },
    }
  );
};

const styleProxy = createStyleProxy();

// The module export structure needs to work with ES Module interop
// When Jest/SWC transforms `import styles from '...'`, it expects:
// - __esModule: true (marks as ES module)
// - default: the actual exported value
module.exports = {
  __esModule: true,
  default: styleProxy,
};

// Also support direct CommonJS require() usage
Object.assign(module.exports, styleProxy);
