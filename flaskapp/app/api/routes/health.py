"""
Health Check API Routes
Health and status endpoints
"""

from flask import Blueprint, jsonify
import logging

# Configure logging
logger = logging.getLogger(__name__)

# Create blueprint
health_bp = Blueprint('health', __name__)

@health_bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy', 
        'service': 'AEOCHECKER - AI Search Engine Optimization Analyzer',
        'version': '1.0.0',
        'modules': [
            'AI Presence Analysis',
            'Competitor Landscape Analysis', 
            'Knowledge Base Analysis',
            'Answerability Analysis',
            'AI Crawler Accessibility Analysis'
        ]
    })

@health_bp.route('/status', methods=['GET'])
def status_check():
    """Detailed status endpoint"""
    return jsonify({
        'status': 'operational',
        'service': 'AEOCHECKER',
        'version': '1.0.0',
        'features': {
            'ai_presence': 'active',
            'competitor_analysis': 'active',
            'knowledge_base': 'active',
            'answerability': 'active',
            'crawler_accessibility': 'active',
            'structured_data': 'active',
            'serp_analysis': 'active'
        },
        'dependencies': {
            'structured_data_analyzer': 'active',
            'serpapi': 'active'
        }
    })
