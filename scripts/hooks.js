#!/usr/bin/env node
/**
 * Claude Code Hooks CLI
 * Manages all hook-related commands to keep package.json clean
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const command = process.argv[2] || 'help';
const arg = process.argv[3];

const hooksDir = path.join(__dirname, '..', '.claude', 'hooks');

const commands = {
  'setup': () => {
    console.log('🔧 Setting up Claude Code hooks...');
    execSync(`python3 ${path.join(hooksDir, 'setup.py')}`, { stdio: 'inherit' });
  },
  
  'uninstall': () => {
    console.log('🗑️  Uninstalling Claude Code hooks...');
    execSync(`python3 ${path.join(hooksDir, 'setup.py')} uninstall`, { stdio: 'inherit' });
  },
  
  'coverage': () => {
    const reportScript = path.join(hooksDir, 'doc_coverage_report.py');
    
    if (arg === 'all' || !arg) {
      // Run all coverage reports
      console.log('\n📊 Running full documentation coverage analysis...\n');
      console.log('=' * 60);
      console.log('1/4 - Overall Project Coverage');
      console.log('=' * 60);
      execSync(`python3 ${reportScript}`, { stdio: 'inherit' });
      
      console.log('\n' + '=' * 60);
      console.log('2/4 - Webviews Coverage');
      console.log('=' * 60);
      execSync(`python3 ${reportScript} src/webviews`, { stdio: 'inherit' });
      
      console.log('\n' + '=' * 60);
      console.log('3/4 - Commands Coverage');
      console.log('=' * 60);
      execSync(`python3 ${reportScript} src/commands`, { stdio: 'inherit' });
      
      console.log('\n' + '=' * 60);
      console.log('4/4 - Utils Coverage');
      console.log('=' * 60);
      execSync(`python3 ${reportScript} src/utils`, { stdio: 'inherit' });
      
      console.log('\n✅ All coverage reports complete!');
    } else {
      // Run specific coverage report
      console.log(`\n📊 Running documentation coverage for ${arg}...\n`);
      execSync(`python3 ${reportScript} ${arg}`, { stdio: 'inherit' });
    }
  },
  
  'status': () => {
    console.log('📋 Claude Code Hooks Status\n');
    
    // Check if hooks are installed
    const settingsPath = path.join(process.env.HOME, '.claude', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (settings.hooks) {
        console.log('✅ Hooks are installed');
        
        // Count hooks by type
        const hookCounts = {};
        for (const [type, hooks] of Object.entries(settings.hooks)) {
          hookCounts[type] = Array.isArray(hooks) ? hooks.length : 1;
        }
        
        console.log('\nActive hooks:');
        for (const [type, count] of Object.entries(hookCounts)) {
          console.log(`  - ${type}: ${count} hook(s)`);
        }
      } else {
        console.log('❌ Hooks are not installed');
        console.log('Run: npm run hooks setup');
      }
    } else {
      console.log('❌ Claude Code settings not found');
      console.log('Run: npm run hooks setup');
    }
    
    // Check configuration
    const configPath = path.join(hooksDir, 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log('\nConfiguration:');
      console.log(`  - Verification: ${config.verification?.enabled ? '✅' : '❌'}`);
      console.log(`  - Quality Checks: ${config.quality_checks?.enabled ? '✅' : '❌'}`);
      console.log(`  - Tool Optimization: ${config.tool_optimization?.enabled ? '✅' : '❌'}`);
      console.log(`  - Docs Sync: ${config.sub_agents?.['docs-sync']?.enabled ? '✅' : '❌'}`);
      console.log(`  - Quality Guardian: ${config.sub_agents?.['quality-guardian']?.enabled ? '✅' : '❌'}`);
    }
  },
  
  'help': () => {
    console.log(`
╔═══════════════════════════════════════╗
║     Claude Code Hooks CLI            ║
╚═══════════════════════════════════════╝

Usage: npm run hooks [command] [args]

Commands:
  setup              Setup Claude Code hooks
  uninstall          Remove Claude Code hooks  
  status             Show hooks installation status
  coverage [dir]     Run documentation coverage report
                     • no args or 'all' = all reports
                     • specific dir = single report
  help               Show this help

Examples:
  npm run hooks setup              # Install hooks
  npm run hooks status             # Check if hooks are active
  npm run hooks coverage           # Run all coverage reports
  npm run hooks coverage src/webviews  # Run specific coverage
  npm run docs:check              # Alias for all coverage reports

Documentation:
  See .claude/hooks/README.md for detailed information
    `);
  }
};

// Execute command
try {
  const cmd = commands[command];
  if (cmd) {
    cmd();
  } else {
    console.error(`❌ Unknown command: ${command}\n`);
    commands.help();
    process.exit(1);
  }
} catch (error) {
  console.error(`\n❌ Error executing command: ${error.message}`);
  process.exit(1);
}