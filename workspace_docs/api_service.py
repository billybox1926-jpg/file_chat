"""
API Gateway and Routing Service.
Handles incoming HTTP requests and authentication middleware.
"""
import time
import json
from typing import Dict, Any, Optional

class APIGateway:
    def __init__(self, port: int = 8080, rate_limit: int = 100):
        self.port = port
        self.rate_limit = rate_limit
        self.request_counts: Dict[str, int] = {}
        self.routes: Dict[str, Any] = {}

    def register_route(self, path: str, handler: Any) -> None:
        """Register a path handler."""
        self.routes[path] = handler

    def handle_request(self, client_ip: str, path: str) -> Dict[str, Any]:
        """Process incoming request with rate limiting check."""
        current_count = self.request_counts.get(client_ip, 0)
        if current_count >= self.rate_limit:
            return {"status": 429, "error": "Rate limit exceeded"}
        
        self.request_counts[client_ip] = current_count + 1
        
        if path not in self.routes:
            return {"status": 404, "error": "Endpoint not found"}
            
        handler = self.routes[path]
        return {"status": 200, "data": handler()}

    def reset_limits(self) -> None:
        """Reset all rate limiter windows."""
        self.request_counts.clear()
