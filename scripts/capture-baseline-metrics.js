#!/usr/bin/env node
/**
 * Baseline Metrics Capture Script
 *
 * Executes Jest test suite with memory profiling and captures:
 * - Peak memory usage (RSS and heap)
 * - Total test duration
 * - Coverage percentages
 *
 * Usage: node scripts/capture-baseline-metrics.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const METRICS_FILE = path.join(__dirname, '../docs/testing/baseline-metrics.md');

function captureMetrics(label) {
  console.log(`\n📊 Capturing metrics: ${label}\n`);

  const startTime = Date.now();

  try {
    // Execute Jest with coverage using /usr/bin/time for accurate memory tracking
    // -l flag provides detailed resource usage including peak memory
    const output = execSync('/usr/bin/time -l npm run test:coverage 2>&1', {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      shell: '/bin/bash'
    });

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // Parse coverage from Jest output
    const coverageMatch = output.match(/All files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)/);
    const coverage = coverageMatch ? {
      statements: coverageMatch[1],
      branches: coverageMatch[2],
      functions: coverageMatch[3],
      lines: coverageMatch[4]
    } : null;

    // Parse memory from /usr/bin/time output (macOS format)
    // Maximum resident set size: shows peak memory in bytes
    const maxRSSMatch = output.match(/(\d+)\s+maximum resident set size/);
    const peakRSS = maxRSSMatch ? parseInt(maxRSSMatch[1], 10) / 1024 / 1024 : 0; // Convert bytes to MB

    const metrics = {
      label,
      timestamp: new Date().toISOString(),
      duration: `${duration}s`,
      memory: {
        peakRSS: `${peakRSS.toFixed(2)} MB`,
        note: 'Measured using /usr/bin/time -l for entire test suite process tree'
      },
      coverage,
      nodeVersion: process.version,
      platform: process.platform
    };

    console.log('✅ Metrics captured successfully:\n');
    console.log(JSON.stringify(metrics, null, 2));

    return metrics;

  } catch (error) {
    console.error('❌ Metrics capture failed:', error.message);
    console.error('Error output:', error.stdout || error.stderr || 'No output');
    return null;
  }
}

function saveMetrics(baselineMetrics, optimizedMetrics = null) {
  const content = `# Test Suite Performance Metrics

## Baseline Metrics (Before Optimization)

**Captured:** ${baselineMetrics.timestamp}

- **Duration:** ${baselineMetrics.duration}
- **Peak RSS:** ${baselineMetrics.memory.peakRSS}
- **Coverage:** ${baselineMetrics.coverage ? `${baselineMetrics.coverage.lines}%` : 'N/A'}
- **Node Version:** ${baselineMetrics.nodeVersion}
- **Platform:** ${baselineMetrics.platform}

${baselineMetrics.coverage ? `
### Coverage Breakdown

- **Statements:** ${baselineMetrics.coverage.statements}%
- **Branches:** ${baselineMetrics.coverage.branches}%
- **Functions:** ${baselineMetrics.coverage.functions}%
- **Lines:** ${baselineMetrics.coverage.lines}%
` : ''}

---

${optimizedMetrics ? `
## Optimized Metrics (After Step 1 Quick Wins)

**Captured:** ${optimizedMetrics.timestamp}

- **Duration:** ${optimizedMetrics.duration}
- **Peak RSS:** ${optimizedMetrics.memory.peakRSS}
- **Coverage:** ${optimizedMetrics.coverage ? `${optimizedMetrics.coverage.lines}%` : 'N/A'}

### Improvement Analysis

- **Memory Reduction:** TBD (calculate after both captures)
- **Duration Change:** TBD
- **Coverage Change:** TBD

---
` : '## Optimized Metrics\n\n_Run after Step 1 configuration changes complete_\n\n---\n'}

## Validation Notes

- Baseline captured with: \`maxWorkers: 75%\`, no explicit heap size
- Optimized captured with: \`maxWorkers: 50%\`, heap size: 4096MB
- Expected improvement: 30-40% memory reduction, similar duration

## Next Steps

- If memory reduction <30%: Proceed immediately to Step 3 (file splitting)
- If memory reduction ≥30%: Continue with Step 2 (infrastructure)
`;

  fs.mkdirSync(path.dirname(METRICS_FILE), { recursive: true });
  fs.writeFileSync(METRICS_FILE, content, 'utf8');
  console.log(`\n✅ Metrics saved to: ${METRICS_FILE}\n`);
}

// Main execution
if (require.main === module) {
  const baseline = captureMetrics('Baseline');
  if (baseline) {
    saveMetrics(baseline);
  } else {
    process.exit(1);
  }
}

module.exports = { captureMetrics, saveMetrics };
