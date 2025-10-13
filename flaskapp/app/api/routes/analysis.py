"""
Analysis API Routes
Main analysis endpoint for AEOCHECKER
"""

from flask import Blueprint, request, jsonify
import uuid
from datetime import datetime
import logging
from app.services.ai_presence import AIPresenceService
from app.services.competitor_analysis import CompetitorAnalysisService
from app.services.knowledge_base import KnowledgeBaseService
from app.services.answerability import AnswerabilityService
from app.services.crawler_accessibility import CrawlerAccessibilityService
from app.services.structured_data import StructuredDataAnalyzer
from app.config import Config

# Configure logging
logger = logging.getLogger(__name__)

# Create blueprint
analysis_bp = Blueprint('analysis', __name__)

# Initialize services
ai_presence_service = AIPresenceService()
competitor_service = CompetitorAnalysisService()
knowledge_base_service = KnowledgeBaseService()
answerability_service = AnswerabilityService()
crawler_accessibility_service = CrawlerAccessibilityService()

# Initialize existing analyzers
structured_data_analyzer = StructuredDataAnalyzer()

# In-memory run history (Phase 5 - lightweight)
RUN_HISTORY = []  # list of dicts {id, url, created_at, response}
MAX_HISTORY = 100

@analysis_bp.route('/analyze', methods=['POST'])
def analyze_structured_data():
    """
    Main analysis endpoint for AEOCHECKER
    Analyzes AI presence, competitor landscape, knowledge base, answerability, and crawler accessibility
    """
    try:
        # Get JSON data from request
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No JSON data provided'}), 400
            
        url = data.get('url')
        competitor_urls = data.get('competitor_urls', [])
        
        if not url:
            return jsonify({'success': False, 'error': 'URL is required'}), 400
        
        # Add protocol if missing
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        
        logger.info(f"Starting AEOCHECKER analysis for URL: {url}")
        
        # Get HTML content for analysis
        try:
            import requests
            html_response = requests.get(url, timeout=10)
            html_content = html_response.text
        except Exception as e:
            return jsonify({'success': False, 'error': f'Failed to fetch URL: {str(e)}'}), 400
        
        # Run all AEOCHECKER modules
        results = {}
        
        # 1. AI Presence Analysis
        logger.info("Running AI Presence analysis...")
        ai_presence = ai_presence_service.analyze_ai_presence(url)
        results['ai_presence'] = ai_presence
        
        # 2. Competitor Landscape Analysis
        if competitor_urls:
            logger.info("Running Competitor Landscape analysis...")
            competitor_analysis = competitor_service.analyze_competitor_landscape(url, competitor_urls)
            results['competitor_analysis'] = competitor_analysis
        else:
            results['competitor_analysis'] = {
                'score': 0,
                'message': 'No competitor URLs provided',
                'recommendations': ['Add competitor URLs for comparison']
            }
        
        # 3. Knowledge Base Analysis
        logger.info("Running Knowledge Base analysis...")
        knowledge_base = knowledge_base_service.analyze_knowledge_base(url, html_content)
        results['knowledge_base'] = knowledge_base
        
        # 4. Answerability Analysis
        logger.info("Running Answerability analysis...")
        answerability = answerability_service.analyze_answerability(url, html_content)
        results['answerability'] = answerability
        
        # 5. AI Crawler Accessibility Analysis
        logger.info("Running AI Crawler Accessibility analysis...")
        crawler_accessibility = crawler_accessibility_service.analyze_crawler_accessibility(url, html_content)
        results['crawler_accessibility'] = crawler_accessibility
        
        # 6. Existing Structured Data Analysis
        logger.info("Running Structured Data analysis...")
        structured_data_metrics = structured_data_analyzer.analyze_url(url)
        
        # Calculate Strategy Review as composite of KB + Answerability + Crawler + Structured Data
        structured_data_avg = 0
        try:
            sd = {
                'coverage': float(getattr(structured_data_metrics, 'coverage_score', 0) or 0),
                'quality': float(getattr(structured_data_metrics, 'quality_score', 0) or 0),
                'completeness': float(getattr(structured_data_metrics, 'completeness_score', 0) or 0),
            }
            structured_data_avg = (sd['coverage'] + sd['quality'] + sd['completeness']) / 3.0
        except Exception:
            structured_data_avg = 0

        strategy_review_score = (
            float(knowledge_base.get('score', 0)) +
            float(answerability.get('score', 0)) +
            float(crawler_accessibility.get('score', 0)) +
            float(structured_data_avg)
        ) / 4.0

        # Calculate weighted overall score (env-configurable weights)
        def _apply_weights(ai_presence_score: float, competitor_score: float, strategy_review_score: float):
            import json
            weights = {'ai_presence': 1/3, 'competitor': 1/3, 'strategy_review': 1/3}
            try:
                if Config.AEO_WEIGHTS_JSON:
                    parsed = json.loads(Config.AEO_WEIGHTS_JSON)
                    for k in ['ai_presence', 'competitor', 'strategy_review']:
                        if isinstance(parsed.get(k), (int, float)):
                            weights[k] = float(parsed[k])
                    total = sum(weights.values()) or 1.0
                    for k in weights:
                        weights[k] = weights[k] / total
            except Exception:
                pass
            score = (
                ai_presence_score * weights['ai_presence'] +
                competitor_score * weights['competitor'] +
                strategy_review_score * weights['strategy_review']
            )
            return score, weights

        overall_score, weights_used = _apply_weights(
            float(ai_presence.get('score', 0)),
            float(results['competitor_analysis'].get('score', 0)),
            float(strategy_review_score)
        )
        
        # Determine grade
        if overall_score >= 90:
            grade = "A+"
            grade_color = "#10B981"  # Green
        elif overall_score >= 80:
            grade = "A"
            grade_color = "#10B981"  # Green
        elif overall_score >= 70:
            grade = "B"
            grade_color = "#F59E0B"  # Yellow
        elif overall_score >= 60:
            grade = "C"
            grade_color = "#F59E0B"  # Yellow
        elif overall_score >= 50:
            grade = "D"
            grade_color = "#EF4444"  # Red
        else:
            grade = "F"
            grade_color = "#EF4444"  # Red
        
        # Collect all recommendations
        all_recommendations = []
        for module_name, module_results in results.items():
            if isinstance(module_results, dict) and 'recommendations' in module_results:
                all_recommendations.extend(module_results['recommendations'])
        
        # Prepare comprehensive response
        response = {
            'success': True,
            'url': url,
            'grade': grade,
            'grade_color': grade_color,
            'overall_score': round(overall_score, 1),
            'module_scores': {
                'ai_presence': ai_presence.get('score', 0),
                'competitor_analysis': results['competitor_analysis'].get('score', 0),
                'knowledge_base': knowledge_base.get('score', 0),
                'answerability': answerability.get('score', 0),
                'crawler_accessibility': crawler_accessibility.get('score', 0)
            },
            'module_weights': weights_used,
            'detailed_analysis': results,
            'structured_data': {
                'total_schemas': structured_data_metrics.total_schemas,
                'valid_schemas': structured_data_metrics.valid_schemas,
                'invalid_schemas': structured_data_metrics.invalid_schemas,
                'schema_types': structured_data_metrics.schema_types,
                'coverage_score': round(structured_data_metrics.coverage_score, 1),
                'quality_score': round(structured_data_metrics.quality_score, 1),
                'completeness_score': round(structured_data_metrics.completeness_score, 1),
                'seo_relevance_score': round(structured_data_metrics.seo_relevance_score, 1),
                'details': structured_data_metrics.details
            },
            'all_recommendations': all_recommendations,
            'analysis_timestamp': datetime.utcnow().isoformat() + 'Z'
        }
        
        logger.info(f"AEOCHECKER analysis completed for {url} with overall score: {overall_score}")
        # Save to in-memory history
        try:
            run_id = str(uuid.uuid4())
            history_entry = {
                'id': run_id,
                'url': url,
                'created_at': datetime.utcnow().isoformat() + 'Z',
                'response': response
            }
            RUN_HISTORY.insert(0, history_entry)
            # Cap history size
            if len(RUN_HISTORY) > MAX_HISTORY:
                del RUN_HISTORY[MAX_HISTORY:]
            # Echo id in response
            response['run_id'] = run_id
        except Exception:
            pass

        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Error in AEOCHECKER analysis: {e}")
        return jsonify({
            'success': False,
            'error': f'AEOCHECKER analysis failed: {str(e)}'
        }), 500


@analysis_bp.route('/runs', methods=['GET'])
def list_runs():
    """List recent analysis runs (lightweight in-memory)."""
    try:
        limit = int(request.args.get('limit', '20'))
    except Exception:
        limit = 20
    items = [
        {
            'id': r.get('id'),
            'url': r.get('url'),
            'created_at': r.get('created_at'),
            'overall_score': r.get('response', {}).get('overall_score'),
            'grade': r.get('response', {}).get('grade')
        }
        for r in RUN_HISTORY[:max(1, min(limit, 100))]
    ]
    return jsonify({'items': items})


@analysis_bp.route('/runs/<run_id>', methods=['GET'])
def get_run(run_id: str):
    """Get a specific analysis run by id (in-memory)."""
    for r in RUN_HISTORY:
        if r.get('id') == run_id:
            return jsonify(r)
    return jsonify({'error': 'Not found'}), 404
