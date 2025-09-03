#!/usr/bin/env python3
"""
Decision Engine for Claude Code Hooks
Determines whether to approve, block, or modify tool calls
"""

import re
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path
import json


class DecisionEngine:
    def __init__(self, config: Dict[str, Any]):
        """Initialize decision engine with configuration"""
        self.config = config
        self.verification_config = config.get("verification", {})
        self.quality_config = config.get("quality_checks", {})
        self.thresholds = config.get("thresholds", {})
        
    def evaluate_tool_call(self, tool_name: str, tool_input: Dict[str, Any], 
                           context: Dict[str, Any]) -> Tuple[str, Optional[str], Optional[Dict]]:
        """
        Evaluate a tool call and return decision
        Returns: (decision, reason, modified_input)
        """
        # Check if verification needed
        if self._needs_assumption_verification(tool_name, tool_input, context):
            return self._create_verification_block(tool_name, tool_input)
        
        # Check if quality check needed
        if self._needs_quality_check(tool_name, tool_input, context):
            return self._create_quality_block(tool_input)
        
        # Check for tool optimization
        optimized = self._optimize_tool_call(tool_name, tool_input)
        if optimized:
            return ("approve", None, optimized)
        
        return ("approve", None, None)
    
    def _needs_assumption_verification(self, tool_name: str, tool_input: Dict[str, Any], 
                                      context: Dict[str, Any]) -> bool:
        """Check if assumption verification is needed"""
        if not self.verification_config.get("enabled", False):
            return False
        
        # Check verification count limit
        verifications = context.get("verification_count", 0)
        max_verifications = self.verification_config.get("max_verifications_per_session", 5)
        if verifications >= max_verifications:
            return False
        
        # Check if file matches exclude patterns
        file_path = tool_input.get("file_path", "")
        if file_path and self._matches_exclude_patterns(file_path):
            return False
        
        # Check categories
        if tool_name in ["Write", "Edit", "MultiEdit"]:
            return self._check_verification_categories(tool_input)
        
        return False
    
    def _needs_quality_check(self, tool_name: str, tool_input: Dict[str, Any], 
                             context: Dict[str, Any]) -> bool:
        """Check if quality check is needed"""
        if not self.quality_config.get("enabled", False):
            return False
        
        # Only check after file modifications
        if tool_name not in ["Write", "Edit", "MultiEdit", "NotebookEdit"]:
            return False
        
        # Check file threshold
        modified_files = context.get("modified_files_count", 0)
        threshold = self.thresholds.get("quality_check_files", 5)
        
        return modified_files >= threshold
    
    def _optimize_tool_call(self, tool_name: str, tool_input: Dict[str, Any]) -> Optional[Dict]:
        """Optimize tool calls with modern replacements"""
        if not self.config.get("tool_optimization", {}).get("enabled", False):
            return None
        
        if tool_name != "Bash":
            return None
        
        command = tool_input.get("command", "")
        if not command:
            return None
        
        replacements = self.config["tool_optimization"].get("replacements", {})
        modified_command = command
        
        # Apply replacements
        for old_tool, new_tool in replacements.items():
            if old_tool in command:
                # Check if new tool is available
                import shutil
                if shutil.which(new_tool):
                    modified_command = self._replace_tool_in_command(
                        modified_command, old_tool, new_tool
                    )
        
        if modified_command != command:
            return {**tool_input, "command": modified_command}
        
        return None
    
    def _matches_exclude_patterns(self, file_path: str) -> bool:
        """Check if file matches exclude patterns"""
        exclude_patterns = self.verification_config.get("exclude_patterns", [])
        path = Path(file_path)
        
        for pattern in exclude_patterns:
            # Handle glob patterns
            if "*" in pattern:
                if path.match(pattern):
                    return True
            # Handle directory patterns
            elif pattern.endswith("/"):
                if str(path).startswith(pattern[:-1]):
                    return True
            # Handle extension patterns
            elif pattern.startswith("*."):
                if path.suffix == pattern[1:]:
                    return True
        
        return False
    
    def _check_verification_categories(self, tool_input: Dict[str, Any]) -> bool:
        """Check if verification is needed based on categories"""
        enabled_categories = self.verification_config.get("enabled_categories", [])
        
        content = tool_input.get("content", "") or tool_input.get("new_string", "")
        
        # Library usage detection
        if "library_usage" in enabled_categories:
            import_patterns = [
                r'import\s+[\w\.\*]+',  # Python/Java
                r'from\s+[\w\.]+\s+import',  # Python
                r'require\([\'"][\w\-\/]+[\'"]\)',  # Node.js
                r'use\s+[\w:]+',  # Rust/Perl
                r'#include\s+[<"][\w\/\.]+[>"]',  # C/C++
            ]
            for pattern in import_patterns:
                if re.search(pattern, content):
                    return True
        
        # API integration detection
        if "api_integration" in enabled_categories:
            api_patterns = [
                r'fetch\(',
                r'axios\.',
                r'http\.',
                r'request\(',
                r'api\.',
                r'endpoint',
            ]
            for pattern in api_patterns:
                if re.search(pattern, content, re.IGNORECASE):
                    return True
        
        return False
    
    def _create_verification_block(self, tool_name: str, tool_input: Dict[str, Any]) -> Tuple[str, str, None]:
        """Create verification block message"""
        file_path = tool_input.get("file_path", "unknown file")
        
        reason = f"""🔍 Assumption verification needed for {file_path}

Before proceeding, please verify:
1. Check if required libraries/dependencies are installed
2. Verify file structure matches project conventions
3. Confirm API endpoints and configurations exist
4. Validate data formats and schemas

Use appropriate tools (Read, Grep, Glob) to verify assumptions, then type 'continue' to proceed."""
        
        return ("block", reason, None)
    
    def _create_quality_block(self, tool_input: Dict[str, Any]) -> Tuple[str, str, None]:
        """Create quality check block message"""
        file_path = tool_input.get("file_path", "unknown file")
        
        reason = f"""✅ Quality check needed for {file_path}

Please run appropriate quality checks:
1. Build/compile the project to check for errors
2. Run linting tools if available
3. Execute type checking if applicable
4. Verify tests still pass

After running checks and fixing any issues, type 'continue' to proceed."""
        
        return ("block", reason, None)
    
    def _replace_tool_in_command(self, command: str, old_tool: str, new_tool: str) -> str:
        """Replace old tool with new tool in command"""
        if old_tool == "grep" and new_tool == "rg":
            return self._convert_grep_to_rg(command)
        elif old_tool == "find" and new_tool == "fd":
            return self._convert_find_to_fd(command)
        else:
            # Simple replacement
            return command.replace(old_tool, new_tool)
    
    def _convert_grep_to_rg(self, command: str) -> str:
        """Convert grep command to ripgrep"""
        replacements = [
            (r'\bgrep\b', 'rg'),
            (r'\bgrep\s+-r\b', 'rg'),
            (r'\bgrep\s+-rn\b', 'rg -n'),
            (r'--include="?\*\.(\w+)"?', r'-t \1'),
            (r'\bgrep\s+-n\b', 'rg -n'),
            (r'\bgrep\s+-i\b', 'rg -i'),
            (r'\bgrep\s+-v\b', 'rg -v'),
        ]
        
        modified = command
        for pattern, replacement in replacements:
            modified = re.sub(pattern, replacement, modified)
        
        return modified
    
    def _convert_find_to_fd(self, command: str) -> str:
        """Convert find command to fd"""
        replacements = [
            (r'\bfind\s+\.\s+-name\s+"([^"]+)"', r'fd "\1"'),
            (r"\bfind\s+\.\s+-name\s+'([^']+)'", r"fd '\1'"),
            (r'\bfind\s+\.\s+-type\s+f\s+-name\s+"([^"]+)"', r'fd -t f "\1"'),
            (r'\bfind\s+\.\s+-type\s+d\s+-name\s+"([^"]+)"', r'fd -t d "\1"'),
            (r'\bfind\s+\.\s+-iname\s+"([^"]+)"', r'fd -i "\1"'),
        ]
        
        modified = command
        for pattern, replacement in replacements:
            modified = re.sub(pattern, replacement, modified)
        
        return modified