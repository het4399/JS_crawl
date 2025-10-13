"""
Configuration settings for AEOCHECKER
"""

import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Base configuration"""
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key')
    DEBUG = os.environ.get('DEBUG', 'True').lower() == 'true'
    
    # API Keys
    SERPAPI_API_KEY = os.environ.get('SERPAPI_API_KEY')
    OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY')
    ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY')
    
    # Analysis settings
    MAX_COMPETITORS = int(os.environ.get('MAX_COMPETITORS', '5'))
    REQUEST_TIMEOUT = int(os.environ.get('REQUEST_TIMEOUT', '10'))

    # Weights
    AEO_WEIGHTS_JSON = os.environ.get('AEO_WEIGHTS_JSON', '')
    
    # AI Bot agents for analysis
    AI_BOT_AGENTS = [
        ('GPTBot', r'(?i)gptbot'),
        ('Google-Extended', r'(?i)google-extended'),
        ('ClaudeBot', r'(?i)claudebot|anthropic-ai'),
        ('PerplexityBot', r'(?i)perplexitybot'),
        ('CCBot', r'(?i)ccbot'),
        ('bingbot', r'(?i)bingbot'),
    ]

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
