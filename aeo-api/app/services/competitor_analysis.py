"""
Competitor Landscape Analysis Service
Analyzes competitor pages and compares with target URL
"""

import re
import requests
from typing import Dict, List
# import extruct  # Temporarily disabled due to compatibility issues

class CompetitorAnalysisService:
    """Service for analyzing competitor landscape"""
    
    def __init__(self):
        self.max_competitors = 5
    
    def _fetch_text(self, url: str, timeout: int = 10) -> str:
        """Fetch text content from URL"""
        try:
            resp = requests.get(url, timeout=timeout)
            resp.raise_for_status()
            return resp.text or ''
        except Exception:
            return ''
    
    def _extract_competitor_data(self, url: str) -> Dict:
        """Extract text and schema markup from competitor page"""
        try:
            html = self._fetch_text(url, timeout=10)
            if not html:
                return {'error': 'Failed to fetch page content'}
            
            # Extract text content (basic)
            text_content = re.sub(r'<[^>]+>', ' ', html)
            text_content = re.sub(r'\s+', ' ', text_content).strip()
            
            # Extract schema markup
            jsonld = []
            # Temporarily disabled extruct due to compatibility issues
            # try:
            #     jsonld = extruct.extract(html, base_url=url).get('json-ld') or []
            # except Exception:
            #     pass
            
            # Extract meta information
            title_match = re.search(r'<title[^>]*>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
            title = title_match.group(1).strip() if title_match else ''
            
            description_match = re.search(r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']*)["\']', html, re.IGNORECASE)
            description = description_match.group(1).strip() if description_match else ''
            
            return {
                'url': url,
                'title': title,
                'description': description,
                'text_length': len(text_content),
                'schema_count': len(jsonld),
                'schema_types': [obj.get('@type') for obj in jsonld if isinstance(obj, dict)],
                'text_sample': text_content[:500] + '...' if len(text_content) > 500 else text_content
            }
        except Exception as e:
            return {'error': f'Failed to analyze competitor: {str(e)}'}
    
    def _generate_competitor_recommendations(self, target_data: Dict, competitor_data: List[Dict], score: int) -> List[str]:
        """Generate recommendations based on competitor analysis"""
        recommendations = []
        
        if score < 50:
            recommendations.append("Consider adding more structured data schemas")
            recommendations.append("Analyze competitor content strategies")
        
        # Check for missing schema types that competitors use
        all_competitor_schemas = set()
        for c in competitor_data:
            if 'error' not in c:
                all_competitor_schemas.update(c.get('schema_types', []))
        
        target_schemas = set(target_data.get('schema_types', []))
        missing_schemas = all_competitor_schemas - target_schemas
        
        if missing_schemas:
            recommendations.append(f"Consider adding these schema types used by competitors: {', '.join(missing_schemas)}")
        
        return recommendations
    
    def analyze_competitor_landscape(self, target_url: str, competitor_urls: List[str]) -> Dict:
        """Analyze competitor landscape and compare with target URL"""
        try:
            # Analyze target URL
            target_data = self._extract_competitor_data(target_url)
            
            # Analyze competitors
            competitor_data = []
            for url in competitor_urls[:self.max_competitors]:
                data = self._extract_competitor_data(url)
                competitor_data.append(data)
            
            # Calculate competitive metrics
            target_schema_count = target_data.get('schema_count', 0)
            competitor_schema_counts = [c.get('schema_count', 0) for c in competitor_data if 'error' not in c]
            
            avg_competitor_schemas = sum(competitor_schema_counts) / len(competitor_schema_counts) if competitor_schema_counts else 0
            schema_advantage = target_schema_count - avg_competitor_schemas
            
            # Calculate competitive score
            competitive_score = 0
            if schema_advantage > 0:
                competitive_score += 30
            elif schema_advantage == 0:
                competitive_score += 15
            
            # Check for unique schema types
            all_competitor_schema_types = []
            for c in competitor_data:
                if 'error' not in c:
                    all_competitor_schema_types.extend(c.get('schema_types', []))
            
            unique_schema_types = list(set(all_competitor_schema_types))
            target_schema_types = target_data.get('schema_types', [])
            unique_target_schemas = set(target_schema_types) - set(unique_schema_types)
            if unique_target_schemas:
                competitive_score += 20
            
            # Text content analysis
            target_text_length = target_data.get('text_length', 0)
            competitor_text_lengths = [c.get('text_length', 0) for c in competitor_data if 'error' not in c]
            avg_competitor_text = sum(competitor_text_lengths) / len(competitor_text_lengths) if competitor_text_lengths else 0
            
            if target_text_length > avg_competitor_text * 1.2:
                competitive_score += 25
            elif target_text_length > avg_competitor_text:
                competitive_score += 15
            
            competitive_score = min(100, competitive_score)
            
            return {
                'score': competitive_score,
                'target_analysis': target_data,
                'competitor_analysis': competitor_data,
                'metrics': {
                    'schema_advantage': schema_advantage,
                    'avg_competitor_schemas': avg_competitor_schemas,
                    'unique_schema_types': list(unique_schema_types),
                    'target_unique_schemas': list(unique_target_schemas),
                    'text_length_advantage': target_text_length - avg_competitor_text
                },
                'recommendations': self._generate_competitor_recommendations(target_data, competitor_data, competitive_score)
            }
        except Exception as e:
            return {
                'score': 0,
                'error': f'Competitor analysis failed: {str(e)}',
                'target_analysis': {},
                'competitor_analysis': [],
                'metrics': {},
                'recommendations': ['Retry competitor analysis']
            }
