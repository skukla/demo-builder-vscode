#!/usr/bin/env python3
"""
State Manager for Claude Code Hooks
Handles persistent state across hook executions
"""

import json
import os
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
import hashlib


class StateManager:
    def __init__(self, state_dir: str = ".claude/hooks/state"):
        """Initialize state manager with state directory"""
        self.state_dir = Path(state_dir)
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.session_file = self.state_dir / "session.json"
        self.cache_file = self.state_dir / "cache.json"
        self.metrics_file = self.state_dir / "metrics.json"
        
    def load_session_state(self) -> Dict[str, Any]:
        """Load current session state"""
        if self.session_file.exists():
            with open(self.session_file, 'r') as f:
                return json.load(f)
        return {
            "session_id": self._generate_session_id(),
            "started_at": datetime.now().isoformat(),
            "verifications": [],
            "quality_checks": [],
            "tool_replacements": [],
            "files_modified": [],
            "commits": []
        }
    
    def save_session_state(self, state: Dict[str, Any]) -> None:
        """Save session state to disk"""
        with open(self.session_file, 'w') as f:
            json.dump(state, f, indent=2)
    
    def load_cache(self) -> Dict[str, Any]:
        """Load verification cache"""
        if self.cache_file.exists():
            with open(self.cache_file, 'r') as f:
                cache = json.load(f)
                # Clean expired entries
                return self._clean_expired_cache(cache)
        return {}
    
    def save_cache(self, cache: Dict[str, Any]) -> None:
        """Save verification cache"""
        with open(self.cache_file, 'w') as f:
            json.dump(cache, f, indent=2)
    
    def cache_verification(self, key: str, result: Any, hours: int = 4) -> None:
        """Cache a verification result"""
        cache = self.load_cache()
        cache[key] = {
            "result": result,
            "timestamp": datetime.now().isoformat(),
            "expires_at": (datetime.now() + timedelta(hours=hours)).isoformat()
        }
        self.save_cache(cache)
    
    def get_cached_verification(self, key: str) -> Optional[Any]:
        """Get cached verification if not expired"""
        cache = self.load_cache()
        if key in cache:
            expires_at = datetime.fromisoformat(cache[key]["expires_at"])
            if datetime.now() < expires_at:
                return cache[key]["result"]
        return None
    
    def track_modification(self, file_path: str, tool: str) -> None:
        """Track file modification"""
        state = self.load_session_state()
        state["files_modified"].append({
            "file": file_path,
            "tool": tool,
            "timestamp": datetime.now().isoformat()
        })
        self.save_session_state(state)
    
    def track_verification(self, category: str, result: Dict[str, Any]) -> None:
        """Track verification performed"""
        state = self.load_session_state()
        state["verifications"].append({
            "category": category,
            "result": result,
            "timestamp": datetime.now().isoformat()
        })
        self.save_session_state(state)
    
    def get_verification_count(self) -> int:
        """Get count of verifications in current session"""
        state = self.load_session_state()
        return len(state.get("verifications", []))
    
    def get_modified_files_count(self) -> int:
        """Get count of modified files since last commit"""
        state = self.load_session_state()
        last_commit_time = None
        if state.get("commits"):
            last_commit_time = state["commits"][-1]["timestamp"]
        
        count = 0
        for mod in state.get("files_modified", []):
            if not last_commit_time or mod["timestamp"] > last_commit_time:
                count += 1
        return count
    
    def track_commit(self, commit_hash: Optional[str] = None) -> None:
        """Track a commit"""
        state = self.load_session_state()
        state["commits"].append({
            "hash": commit_hash,
            "timestamp": datetime.now().isoformat(),
            "files_count": self.get_modified_files_count()
        })
        self.save_session_state(state)
    
    def update_metrics(self, metric: str, value: Any) -> None:
        """Update metrics"""
        metrics = {}
        if self.metrics_file.exists():
            with open(self.metrics_file, 'r') as f:
                metrics = json.load(f)
        
        if metric not in metrics:
            metrics[metric] = []
        
        metrics[metric].append({
            "value": value,
            "timestamp": datetime.now().isoformat()
        })
        
        # Keep only last 100 entries per metric
        metrics[metric] = metrics[metric][-100:]
        
        with open(self.metrics_file, 'w') as f:
            json.dump(metrics, f, indent=2)
    
    def cleanup_old_states(self, days: int = 7) -> None:
        """Clean up state files older than specified days"""
        cutoff_date = datetime.now() - timedelta(days=days)
        
        for file in self.state_dir.glob("*.json"):
            if file.stat().st_mtime < cutoff_date.timestamp():
                file.unlink()
    
    def _generate_session_id(self) -> str:
        """Generate unique session ID"""
        timestamp = datetime.now().isoformat()
        return hashlib.md5(timestamp.encode()).hexdigest()[:8]
    
    def _clean_expired_cache(self, cache: Dict[str, Any]) -> Dict[str, Any]:
        """Remove expired cache entries"""
        cleaned = {}
        now = datetime.now()
        
        for key, value in cache.items():
            if "expires_at" in value:
                expires_at = datetime.fromisoformat(value["expires_at"])
                if now < expires_at:
                    cleaned[key] = value
        
        return cleaned