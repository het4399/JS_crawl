"""
AEOCHECKER - AI Search Engine Optimization Analysis Tool
Main application package
"""

from flask import Flask
from flask_cors import CORS
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def create_app():
    """Application factory pattern"""
    app = Flask(__name__)
    
    # Configure CORS
    CORS(app)
    
    # Basic configuration
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key')
    app.config['DEBUG'] = os.environ.get('DEBUG', 'True').lower() == 'true'
    
    # Register blueprints
    from app.api.routes.analysis import analysis_bp
    from app.api.routes.serp import serp_bp
    from app.api.routes.health import health_bp
    
    app.register_blueprint(analysis_bp, url_prefix='/api')
    app.register_blueprint(serp_bp, url_prefix='/api')
    app.register_blueprint(health_bp, url_prefix='/api')
    
    return app
