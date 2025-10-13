"""
SERP API Routes
SERP analysis and lookup endpoints
"""

from flask import Blueprint, request, jsonify
import os
import requests
import logging

# Configure logging
logger = logging.getLogger(__name__)

# Create blueprint
serp_bp = Blueprint('serp', __name__)

@serp_bp.route('/serp', methods=['POST'])
def serp_lookup():
    """Proxy to SerpAPI. Expects JSON with at least { "q": "keyword" }. Optional: engine, gl, hl, location, device, num, start."""
    try:
        payload = request.get_json() or {}
        q = payload.get('q')
        if not q:
            return jsonify({'success': False, 'error': 'Missing required field: q (keyword)'}), 400
        
        api_key = os.environ.get('SERPAPI_API_KEY')
        if not api_key:
            return jsonify({'success': False, 'error': 'SERPAPI_API_KEY not set in environment'}), 500
        
        # Allowed params passthrough
        allowed = ['engine', 'q', 'gl', 'hl', 'location', 'device', 'num', 'start', 'uule', 'safe']
        params = {k: v for k, v in payload.items() if k in allowed and v not in (None, '')}
        if 'engine' not in params:
            params['engine'] = 'google'
        params['api_key'] = api_key
        
        resp = requests.get('https://serpapi.com/search.json', params=params, timeout=30)
        resp.raise_for_status()
        raw = resp.json()
        
        # Light summary
        results = raw.get('organic_results') or []
        your_domain = payload.get('domain')
        your_rank = None
        if your_domain and results:
            for r in results:
                url = r.get('link') or r.get('url')
                if isinstance(url, str) and your_domain in url:
                    your_rank = r.get('position')
                    break
        
        features = []
        for key in ['answer_box', 'knowledge_graph', 'related_questions', 'top_stories', 'local_results']:
            if key in raw and raw.get(key):
                features.append(key)
        
        return jsonify({
            'success': True,
            'query': q,
            'params': {k: v for k, v in params.items() if k != 'api_key'},
            'summary': {
                'top_count': len(results),
                'your_domain': your_domain,
                'your_rank': your_rank,
                'features_detected': features
            },
            'results': results,
            'raw': raw
        })
    except requests.HTTPError as he:
        return jsonify({'success': False, 'error': f'HTTP error from SerpAPI: {he}', 'body': getattr(he, 'response', None).text if hasattr(he, 'response') and he.response is not None else None}), 502
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
