"""
DataForSEO REST Client
Handles API communication with DataForSEO
"""

from http.client import HTTPSConnection
from base64 import b64encode
from json import loads, dumps
import os
from typing import Dict, Any, Optional


class DataForSEOClient:
    """REST client for DataForSEO API"""
    
    domain = "api.dataforseo.com"
    
    def __init__(self, username: Optional[str] = None, password: Optional[str] = None):
        """
        Initialize the DataForSEO client
        
        Args:
            username: DataForSEO API username (defaults to env var DATAFORSEO_USERNAME)
            password: DataForSEO API password (defaults to env var DATAFORSEO_PASSWORD)
        """
        self.username = username or os.getenv('DATAFORSEO_USERNAME', '')
        self.password = password or os.getenv('DATAFORSEO_PASSWORD', '')
        
        if not self.username or not self.password:
            raise ValueError(
                "DataForSEO credentials not provided. "
                "Set DATAFORSEO_USERNAME and DATAFORSEO_PASSWORD environment variables "
                "or pass them to the constructor."
            )
    
    def request(self, path: str, method: str, data: Optional[Any] = None) -> Dict[str, Any]:
        """
        Make a request to the DataForSEO API
        
        Args:
            path: API endpoint path
            method: HTTP method (GET or POST)
            data: Request data (for POST requests)
            
        Returns:
            API response as dictionary
        """
        connection = HTTPSConnection(self.domain)
        try:
            base64_bytes = b64encode(
                f"{self.username}:{self.password}".encode("ascii")
            ).decode("ascii")
            headers = {
                'Authorization': f'Basic {base64_bytes}',
                'Content-Encoding': 'gzip'
            }
            connection.request(method, path, headers=headers, body=data)
            response = connection.getresponse()
            return loads(response.read().decode())
        finally:
            connection.close()
    
    def get(self, path: str) -> Dict[str, Any]:
        """Make a GET request"""
        return self.request(path, 'GET')
    
    def post(self, path: str, data: Any) -> Dict[str, Any]:
        """Make a POST request"""
        if isinstance(data, str):
            data_str = data
        else:
            data_str = dumps(data)
        return self.request(path, 'POST', data_str)

