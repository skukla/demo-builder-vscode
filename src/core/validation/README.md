# Validation Infrastructure

## Purpose

The validation module provides comprehensive input validation for both backend security (command injection prevention, path traversal protection) and frontend user experience (field validation with user-friendly error messages).

This module implements a defense-in-depth security strategy using whitelist validation, length limits, path validation, and error sanitization to prevent command injection, path traversal, SSRF, and information disclosure vulnerabilities.

## When to Use

Use this module when:
- Validating Adobe resource IDs before shell commands
- Validating project names before file system operations
- Validating file paths to prevent directory traversal
- Validating URLs before making HTTP requests
- Sanitizing error messages before logging
- Validating user input in forms
- Checking field values before submission

Do NOT use when:
- Values are hardcoded constants (no validation needed)
- Working with internal-only data structures (not user input)
- Performance-critical tight loops (pre-validate once)

## Key Exports

### Security Validation (Backend)

#### validateAdobeResourceId

**Purpose**: Validate Adobe resource IDs to prevent command injection

**Usage**:
```typescript
import { validateAdobeResourceId } from '@/shared/validation';

validateAdobeResourceId(orgId, 'organization ID');
// Throws if invalid, safe to use in shell commands

await executor.execute(`aio console:org:select ${orgId}`, {
    shell: true,
});
```

**Validates**:
- Non-empty string
- Max 100 characters
- Only alphanumeric, hyphens, underscores
- Blocks shell metacharacters: `$ ( ) ; & | < > \` ' " \`

**Example**:
```typescript
// Valid
validateAdobeResourceId('12345abcde', 'project ID'); // OK
validateAdobeResourceId('proj-123_abc', 'project ID'); // OK

// Invalid (throws)
validateAdobeResourceId('$(rm -rf /)', 'project ID'); // Throws
validateAdobeResourceId('proj; cat /etc/passwd', 'project ID'); // Throws
validateAdobeResourceId('', 'project ID'); // Throws
```

#### validateProjectNameSecurity

**Purpose**: Validate project names for file system safety

**Usage**:
```typescript
import { validateProjectNameSecurity } from '@/shared/validation';

validateProjectNameSecurity(projectName);
// Safe to create directory

const projectPath = path.join(baseDir, projectName);
await fs.mkdir(projectPath);
```

**Validates**:
- Non-empty string
- Max 100 characters
- No path separators (`/`, `\`)
- No parent directory references (`..`)
- Only alphanumeric, hyphens, underscores
- Not reserved system names (con, prn, aux, nul, com1, etc.)

**Example**:
```typescript
// Valid
validateProjectNameSecurity('my-demo-project'); // OK
validateProjectNameSecurity('project_123'); // OK

// Invalid (throws)
validateProjectNameSecurity('../etc/passwd'); // Throws - path traversal
validateProjectNameSecurity('proj; rm -rf /'); // Throws - shell chars
validateProjectNameSecurity('con'); // Throws - reserved name
```

#### validateProjectPath

**Purpose**: Validate file paths are within allowed directory

**Usage**:
```typescript
import { validateProjectPath } from '@/shared/validation';

validateProjectPath(providedPath);
// Safe to access file

await fs.readFile(providedPath);
```

**Validates**:
- Path is within `~/.demo-builder/projects/`
- No path traversal attempts
- Resolves symlinks and normalizes path

**Example**:
```typescript
// Valid
const safePath = path.join(os.homedir(), '.demo-builder', 'projects', 'my-project');
validateProjectPath(safePath); // OK

// Invalid (throws)
validateProjectPath('/etc/passwd'); // Throws - outside allowed dir
const traversal = path.join(os.homedir(), '.demo-builder', 'projects', '..', '..', 'etc', 'passwd');
validateProjectPath(traversal); // Throws - path traversal detected
```

#### Convenience Wrappers

```typescript
import {
    validateOrgId,
    validateProjectId,
    validateWorkspaceId,
    validateMeshId,
} from '@/shared/validation';

// All wrap validateAdobeResourceId with appropriate type name
validateOrgId(orgId);
validateProjectId(projectId);
validateWorkspaceId(workspaceId);
validateMeshId(meshId);
```

#### validateAccessToken

**Purpose**: Validate Adobe access tokens to prevent command injection

**Usage**:
```typescript
import { validateAccessToken } from '@/shared/validation';

validateAccessToken(token);
// Safe to use in shell commands
```

**Validates**:
- Non-empty string
- Length between 50 and 5000 characters
- Starts with "eyJ" (JWT format)
- Only alphanumeric, dots, hyphens, underscores

**Example**:
```typescript
// Valid
validateAccessToken('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...'); // OK

// Invalid (throws)
validateAccessToken('"; rm -rf / #'); // Throws
validateAccessToken('invalid-token'); // Throws - doesn't start with eyJ
```

#### validateURL

**Purpose**: Validate URLs to prevent SSRF and open redirect attacks

**Usage**:
```typescript
import { validateURL } from '@/shared/validation';

validateURL(url);
// Safe to make HTTP request

const response = await fetch(url);
```

**Validates**:
- Valid URL format
- Allowed protocols (default: https only)
- Not localhost or private networks
- Not cloud metadata endpoints

**Example**:
```typescript
// Valid
validateURL('https://example.com/path'); // OK
validateURL('https://api.adobe.com/data'); // OK
validateURL('http://example.com', ['http', 'https']); // OK with http allowed

// Invalid (throws)
validateURL('javascript:alert(1)'); // Throws - invalid protocol
validateURL('https://localhost:3000'); // Throws - SSRF prevention
validateURL('https://192.168.1.1'); // Throws - private network
validateURL('https://169.254.169.254'); // Throws - metadata endpoint
```

#### sanitizeErrorForLogging

**Purpose**: Sanitize error messages before logging (prevent information disclosure)

**Usage**:
```typescript
import { sanitizeErrorForLogging } from '@/shared/validation';

try {
    await riskyOperation();
} catch (error) {
    const safeMessage = sanitizeErrorForLogging(error);
    logger.info(safeMessage); // Safe for user-facing logs
    logger.debug(error.message); // Full details in debug only
}
```

**Sanitizes**:
- Removes absolute paths → `<path>/`
- Removes tokens/secrets → `<redacted>`
- Removes stack traces (keeps first line only)
- Removes environment variable values → `KEY=<redacted>`

**Example**:
```typescript
const error = new Error('Failed at /Users/admin/.ssh/id_rsa with token abc123xyz');
sanitizeErrorForLogging(error);
// Returns: "Failed at <path>/ with token <redacted>"
```

### Field Validation (UI)

#### validateProjectNameUI

**Purpose**: Validate project names with user-friendly error messages

**Usage**:
```typescript
import { validateProjectNameUI } from '@/shared/validation';

const result = validateProjectNameUI(value);
if (!result.isValid) {
    showError(result.message);
}
```

**Returns**:
```typescript
interface FieldValidation {
    isValid: boolean;
    message: string;
}
```

**Example**:
```typescript
validateProjectNameUI('my-project');
// { isValid: true, message: '' }

validateProjectNameUI('');
// { isValid: false, message: 'Project name is required' }

validateProjectNameUI('my project!');
// { isValid: false, message: 'Project name can only contain letters, numbers, hyphens, and underscores' }

validateProjectNameUI('a'.repeat(60));
// { isValid: false, message: 'Project name must be 50 characters or less' }
```

#### validateCommerceUrlUI

**Purpose**: Validate Commerce URLs with user-friendly error messages

**Usage**:
```typescript
import { validateCommerceUrlUI } from '@/shared/validation';

const result = validateCommerceUrlUI(value);
if (!result.isValid) {
    showError(result.message);
}
```

**Example**:
```typescript
validateCommerceUrlUI('https://example.com');
// { isValid: true, message: '' }

validateCommerceUrlUI('');
// { isValid: true, message: '' } (optional field)

validateCommerceUrlUI('invalid');
// { isValid: false, message: 'Invalid URL format' }

validateCommerceUrlUI('ftp://example.com');
// { isValid: false, message: 'URL must start with http:// or https://' }
```

#### validateFieldUI

**Purpose**: Main dispatcher for all UI validation types

**Usage**:
```typescript
import { validateFieldUI } from '@/shared/validation';

const result = validateFieldUI('projectName', value);
const result = validateFieldUI('commerceUrl', value);
```

**Example**:
```typescript
validateFieldUI('projectName', 'my-project');
// { isValid: true, message: '' }

validateFieldUI('commerceUrl', 'https://example.com');
// { isValid: true, message: '' }

validateFieldUI('unknown', 'value');
// { isValid: true, message: '' } (no validation for unknown fields)
```

## Types

### FieldValidation

```typescript
interface FieldValidation {
    isValid: boolean;
    message: string;
}
```

## Architecture

**Directory Structure**:
```
shared/validation/
├── index.ts              # Public API exports
├── securityValidation.ts # Backend security validation
├── fieldValidation.ts    # UI field validation
└── README.md            # This file
```

**Security Layers**:
1. **Whitelist Validation**: Only allow known-safe characters
2. **Length Limits**: Prevent buffer overflow attacks
3. **Path Validation**: Restrict to allowed directories
4. **Format Validation**: Ensure expected formats (JWT, URLs)
5. **Sanitization**: Remove sensitive info from errors

## Usage Patterns

### Pattern 1: Backend Security Validation

```typescript
import {
    validateOrgId,
    validateProjectId,
    validateProjectNameSecurity,
} from '@/shared/validation';

// ALWAYS validate before shell commands
async function selectProject(projectId: string) {
    validateProjectId(projectId); // Throws if invalid

    await executor.execute(`aio console:project:select ${projectId}`, {
        shell: true,
        exclusive: 'adobe-cli',
    });
}

// ALWAYS validate before file operations
async function createProject(name: string) {
    validateProjectNameSecurity(name); // Throws if invalid

    const projectPath = path.join(baseDir, 'projects', name);
    await fs.mkdir(projectPath);
}
```

### Pattern 2: UI Field Validation

```typescript
import { validateFieldUI } from '@/shared/validation';

function handleInputChange(field: string, value: string) {
    const result = validateFieldUI(field, value);

    if (!result.isValid) {
        setError(field, result.message);
    } else {
        clearError(field);
    }
}
```

### Pattern 3: Error Sanitization

```typescript
import { sanitizeErrorForLogging } from '@/shared/validation';

try {
    await deployMesh(meshId, config);
} catch (error) {
    // User-facing log (sanitized)
    const safeMessage = sanitizeErrorForLogging(error);
    logger.info(`Deployment failed: ${safeMessage}`);

    // Debug log (full details)
    logger.debug('Full error details:', error);

    // Show to user
    vscode.window.showErrorMessage(`Deployment failed: ${safeMessage}`);
}
```

### Pattern 4: Comprehensive Input Validation

```typescript
import {
    validateOrgId,
    validateProjectId,
    validateWorkspaceId,
    validateProjectPath,
} from '@/shared/validation';

async function setupProject(input: ProjectInput) {
    // Validate all inputs
    validateOrgId(input.orgId);
    validateProjectId(input.projectId);
    validateWorkspaceId(input.workspaceId);
    validateProjectNameSecurity(input.projectName);
    validateProjectPath(input.projectPath);

    // All inputs validated - safe to use
    await createProject(input);
}
```

## Integration

### Used By
- **Features**:
  - `authentication` - Validating Adobe resource IDs
  - `project-creation` - Validating project names and paths
  - `mesh` - Validating mesh IDs and URLs
- **Shared**:
  - `command-execution` - Command name validation
  - `logging` - Error sanitization
- **Handlers**: All backend handlers validate inputs

### Dependencies
- Node.js `os`, `path` - Path validation
- No external dependencies (pure TypeScript)

## Best Practices

1. **Validate Early**: Validate at system boundaries (API handlers, user input)
2. **Whitelist Approach**: Only allow known-safe patterns
3. **Fail Securely**: Throw errors for invalid input (don't silently accept)
4. **Sanitize Errors**: Always sanitize before logging or showing to users
5. **Layer Validation**: Use both UI and backend validation
6. **Document Patterns**: Clearly document what's allowed/blocked
7. **Test Edge Cases**: Test with malicious inputs in development

## Common Patterns

### Defense in Depth

```typescript
// Layer 1: UI validation (user-friendly)
const uiResult = validateProjectNameUI(name);
if (!uiResult.isValid) {
    return showError(uiResult.message);
}

// Layer 2: Backend security validation (strict)
try {
    validateProjectNameSecurity(name); // Can still throw
} catch (error) {
    return showError('Invalid project name');
}

// Both layers passed - safe to use
await createProject(name);
```

### Validation Checklist Pattern

```typescript
// Before using shell: true, validate ALL inputs
function validateForShellExecution(input: CommandInput) {
    validateOrgId(input.orgId);           // ✓
    validateProjectId(input.projectId);   // ✓
    validateWorkspaceId(input.workspaceId); // ✓
    validateProjectPath(input.projectPath); // ✓
    // All validated - safe to use shell: true
}
```

## Error Handling

All validation functions throw descriptive errors:

```typescript
try {
    validateProjectNameSecurity('../../etc/passwd');
} catch (error) {
    console.error(error.message);
    // "Project name cannot contain path separators or parent directory references"
}

try {
    validateAdobeResourceId('proj; rm -rf /', 'project ID');
} catch (error) {
    console.error(error.message);
    // "Invalid project ID: contains illegal characters (only letters, numbers, hyphens, and underscores allowed)"
}
```

UI validation returns objects (no throws):

```typescript
const result = validateProjectNameUI('invalid!');
// { isValid: false, message: 'Project name can only contain...' }
```

## Performance Considerations

- **Regex Validation**: Fast regex operations (microseconds)
- **Path Resolution**: Minimal overhead (uses Node.js built-ins)
- **Early Validation**: Validate once at entry points, not in loops
- **Sanitization**: Efficient regex-based replacement
- **No Network Calls**: All validation is synchronous and local

## Security Considerations

### Whitelist vs Blacklist

This module uses **whitelist validation** (safer approach):

```typescript
// WHITELIST (used) - Only allow known-safe characters
if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error('Invalid ID');
}

// BLACKLIST (avoided) - Try to block dangerous characters
if (id.includes(';') || id.includes('$')) {
    throw new Error('Invalid ID');
}
// Problem: Easy to miss dangerous characters
```

### SSRF Protection

URL validation prevents Server-Side Request Forgery:

```typescript
validateURL(url);
// Blocks:
// - localhost (127.0.0.1, ::1)
// - Private IPs (10.x.x.x, 192.168.x.x, 172.16-31.x.x)
// - Cloud metadata (169.254.169.254)
// - Invalid protocols (javascript:, file:, data:)
```

### Information Disclosure Prevention

Error sanitization prevents leaking sensitive information:

```typescript
sanitizeErrorForLogging(error);
// Removes:
// - File paths (/Users/admin/.ssh/id_rsa)
// - Tokens (eyJhbGciOiJSUzI1NiI...)
// - Stack traces
// - Environment variables (API_KEY=secret123)
```

## Guidelines

**Adding to This Module**:
- New validators must serve 2+ features
- Must use whitelist approach (not blacklist)
- Must have clear documentation of what's allowed
- Must include usage examples
- Security validators throw errors
- UI validators return FieldValidation objects

**Moving from Feature to Shared**:
When you find validation logic duplicated:
1. Extract to this module
2. Add comprehensive tests
3. Document security implications
4. Update all usage sites
5. Add to validation checklist in command-execution

## See Also

- **Related Shared Modules**:
  - `@/shared/command-execution` - Uses validation for security
  - `@/shared/logging` - Uses sanitization for error logging

- **Related Documentation**:
  - Main architecture: `../../CLAUDE.md`
  - Shared overview: `../CLAUDE.md`
  - Security guidelines: `../../docs/security/validation.md`
  - Command execution: `../command-execution/README.md`

---

*This is shared infrastructure - maintain high quality standards*
