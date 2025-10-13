"""
AEOCHECKER - AI Search Engine Optimization Analysis Tool
Main application entry point
"""

from app import create_app
import logging
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create Flask app
app = create_app()

if __name__ == '__main__':
    logger.info("Starting AEOCHECKER - AI Search Engine Optimization Analyzer")
    logger.info("Available modules:")
    logger.info("- AI Presence Analysis")
    logger.info("- Competitor Landscape Analysis")
    logger.info("- Knowledge Base Analysis")
    logger.info("- Answerability Analysis")
    logger.info("- AI Crawler Accessibility Analysis")
    logger.info("- Structured Data Analysis")
    
    # Run the application
    app.run(
        debug=os.environ.get('DEBUG', 'True').lower() == 'true',
        host='0.0.0.0',
        port=int(os.environ.get('PORT', 5000))
    )
