#!/usr/bin/env python3
"""
Diagnostic script to check what's installed
"""
import sys
import subprocess

print(f"Python path: {sys.executable}")
print(f"Python version: {sys.version}")

# Check if we're in a virtual environment
in_venv = hasattr(sys, 'real_prefix') or (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix)
print(f"Virtual environment: {'Yes' if in_venv else 'No'}")

# Try to import packages
packages = ['fastapi', 'uvicorn', 'spacy', 'pydantic', 'beautifulsoup4']

print("\nChecking packages:")
for package in packages:
    try:
        __import__(package)
        print(f"✅ {package}")
    except ImportError:
        print(f"❌ {package} - NOT FOUND")

print("\nTo fix missing packages, run:")
print("pip install -r requirements.txt")

