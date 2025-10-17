#!/usr/bin/env python3
"""
Startup script for the SEO Keyword Extractor API
"""
import sys
import os

# Add the current directory to Python path so we can import app as a module
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

if __name__ == "__main__":
    try:
        import uvicorn
    except ImportError:
        print("❌ uvicorn not found. Please install dependencies:")
        print("   pip install -r requirements.txt")
        sys.exit(1)
    
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=["app"]
    )
