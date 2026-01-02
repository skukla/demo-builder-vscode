# Step 3: Infrastructure - Webpack CSS Modules Setup

## Status
- [ ] Tests Written
- [ ] Implementation Complete
- [ ] Tests Passing
- [ ] Refactored

## Objective
Configure webpack to support CSS Modules (`*.module.css` files) alongside existing global CSS, enabling feature-scoped styling.

## Prerequisites
- [ ] Step 1 complete (dead CSS removed)
- [ ] Step 2 complete (keyframe duplication fixed)

## Tests to Write First

- [ ] **Test: CSS Modules rule exists in webpack config**
  - Given: webpack.config.js
  - When: Examining module.rules
  - Then: A rule with `test: /\.module\.css$/` exists with modules option enabled

- [ ] **Test: Global CSS rule excludes module files**
  - Given: webpack.config.js CSS rule
  - When: Examining the `/\.css$/` rule
  - Then: It has `exclude: /\.module\.css$/`

- [ ] **Test: Sample CSS Module compiles correctly**
  - Given: A test `*.module.css` file with `.testClass { color: red; }`
  - When: Imported in a component
  - Then: Class name is transformed (contains hash)

## Files to Modify

- [ ] `webpack.config.js` - Add CSS Modules rule before global CSS rule

## Implementation Details

### RED Phase
Create test file verifying webpack config structure.

### GREEN Phase

**webpack.config.js** - Replace CSS rule (lines 62-64):
```javascript
{
  test: /\.module\.css$/,
  use: [
    'style-loader',
    {
      loader: 'css-loader',
      options: {
        modules: {
          localIdentName: '[name]__[local]--[hash:base64:5]'
        }
      }
    }
  ]
},
{
  test: /\.css$/,
  exclude: /\.module\.css$/,
  use: ['style-loader', 'css-loader']
}
```

### REFACTOR Phase
Verify existing CSS imports still work. No dependencies to install (css-loader already supports modules option).

**Note:** TypeScript declarations are created in Step 4.

## Acceptance Criteria
- [ ] `*.module.css` files compile with hashed class names
- [ ] Existing `*.css` imports continue working unchanged
- [ ] Build completes without warnings
- [ ] Ready for Step 4 (TypeScript declarations)

## Estimated Time
30 minutes
