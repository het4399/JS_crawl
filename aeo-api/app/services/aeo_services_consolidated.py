"""
AEO Services - Consolidated
Main service orchestrator that imports from separate service files
"""

from .ai_presence import AIPresenceService
from .competitor_analysis import CompetitorAnalysisService
from .knowledge_base import KnowledgeBaseService
from .answerability import AnswerabilityService
from .crawler_accessibility import CrawlerAccessibilityService
from .structured_data import StructuredDataService

class AEOServiceOrchestrator:
    """Main orchestrator for all AEO analysis services"""
    
    def __init__(self):
        self.ai_presence_service = AIPresenceService()
        self.competitor_service = CompetitorAnalysisService()
        self.knowledge_base_service = KnowledgeBaseService()
        self.answerability_service = AnswerabilityService()
        self.crawler_accessibility_service = CrawlerAccessibilityService()
        self.structured_data_service = StructuredDataService()
    
    def analyze_ai_presence(self, url: str) -> dict:
        """Analyze AI presence and accessibility"""
        return self.ai_presence_service.analyze_ai_presence(url)
    
    def analyze_competitor_landscape(self, target_url: str, competitor_urls: list) -> dict:
        """Analyze competitor landscape"""
        return self.competitor_service.analyze_competitor_landscape(target_url, competitor_urls)
    
    def analyze_knowledge_base(self, url: str, html_content: str) -> dict:
        """Analyze knowledge base quality"""
        return self.knowledge_base_service.analyze_knowledge_base(url, html_content)
    
    def analyze_answerability(self, url: str, html_content: str) -> dict:
        """Analyze answerability and Q&A content"""
        return self.answerability_service.analyze_answerability(url, html_content)
    
    def analyze_crawler_accessibility(self, url: str, html_content: str) -> dict:
        """Analyze crawler accessibility"""
        return self.crawler_accessibility_service.analyze_crawler_accessibility(url, html_content)
    
    def analyze_structured_data(self, url: str, html_content: str = None) -> dict:
        """Analyze structured data"""
        return self.structured_data_service.analyze_structured_data(url, html_content)
    
    def run_complete_analysis(self, url: str, html_content: str = None, competitor_urls: list = None) -> dict:
        """Run complete AEO analysis"""
        try:
            import requests
            
            # Fetch HTML content if not provided
            if not html_content:
                try:
                    response = requests.get(url, timeout=10)
                    html_content = response.text
                except Exception as e:
                    return {
                        'error': f'Failed to fetch content: {str(e)}',
                        'url': url
                    }
            
            # Run all analyses
            results = {
                'url': url,
                'ai_presence': self.analyze_ai_presence(url),
                'knowledge_base': self.analyze_knowledge_base(url, html_content),
                'answerability': self.analyze_answerability(url, html_content),
                'crawler_accessibility': self.analyze_crawler_accessibility(url, html_content),
                'structured_data': self.analyze_structured_data(url, html_content),
                # Competitor analysis now runs automatically (uses DataForSEO API)
                'competitor_analysis': self.analyze_competitor_landscape(url, competitor_urls or [])
            }
            
            # Calculate overall score and module scores
            scores = []
            module_scores = {}
            
            for key, analysis in results.items():
                if isinstance(analysis, dict) and 'score' in analysis:
                    scores.append(analysis['score'])
                    module_scores[key] = analysis['score']
            
            if scores:
                overall_score = sum(scores) / len(scores)
            else:
                overall_score = 0
            
            # Return in the expected frontend format
            return {
                'url': url,
                'overall_score': overall_score,
                'module_scores': module_scores,
                'detailed_analysis': {
                    'ai_presence': results.get('ai_presence', {}),
                    'competitor_analysis': results.get('competitor_analysis', {}),
                    'knowledge_base': results.get('knowledge_base', {}),
                    'answerability': results.get('answerability', {}),
                    'crawler_accessibility': results.get('crawler_accessibility', {}),
                    'structured_data': results.get('structured_data', {})
                },
                'recommendations': self._generate_recommendations(results),
                'analysis_timestamp': __import__('datetime').datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                'error': f'Complete analysis failed: {str(e)}',
                'url': url
            }
    
    def _generate_recommendations(self, results: dict) -> list:
        """Generate prioritized, actionable recommendations from analysis results"""
        all_recommendations = []
        priority_map = {
            'high': [],
            'medium': [],
            'low': []
        }
        
        # Generic/error recommendations to filter out
        generic_patterns = [
            'retry',
            'check',
            'configure',
            'failed',
            'error',
            'unavailable',
            'try again'
        ]
        
        # Collect all recommendations with metadata
        for key, analysis in results.items():
            if isinstance(analysis, dict) and 'recommendations' in analysis:
                module_score = analysis.get('score', 0)
                for rec in analysis.get('recommendations', []):
                    if rec and isinstance(rec, str):
                        # Filter out generic/error recommendations
                        rec_lower = rec.lower()
                        if any(pattern in rec_lower for pattern in generic_patterns):
                            continue
                        
                        # Determine priority based on score and module
                        priority = self._determine_priority(rec, module_score, key)
                        priority_map[priority].append(rec)
                        all_recommendations.append(rec)
        
        # Remove duplicates while preserving order
        seen = set()
        filtered_recommendations = []
        
        # Add high priority first
        for rec in priority_map['high']:
            if rec not in seen:
                seen.add(rec)
                filtered_recommendations.append(rec)
        
        # Then medium priority
        for rec in priority_map['medium']:
            if rec not in seen:
                seen.add(rec)
                filtered_recommendations.append(rec)
        
        # Finally low priority
        for rec in priority_map['low']:
            if rec not in seen:
                seen.add(rec)
                filtered_recommendations.append(rec)
        
        return filtered_recommendations[:20]  # Limit to top 20 recommendations
    
    def _determine_priority(self, recommendation: str, score: float, module: str) -> str:
        """Determine priority level for a recommendation"""
        rec_lower = recommendation.lower()
        
        # High priority: Critical fixes and missing essentials
        high_priority_keywords = [
            'add title tag',
            'add meta description',
            'allow indexing',
            'robots.txt',
            'sitemap',
            'schema',
            'structured data',
            'faq section',
            'canonical',
            'organization schema',
            'website schema',
            'webpage schema'
        ]
        
        # Medium priority: Improvements and optimizations
        medium_priority_keywords = [
            'improve',
            'enhance',
            'optimize',
            'add more',
            'better',
            'clear',
            'formatting',
            'alt text',
            'open graph',
            'twitter card'
        ]
        
        # Check for high priority keywords
        if any(keyword in rec_lower for keyword in high_priority_keywords):
            return 'high'
        
        # Low scores indicate high priority issues
        if score < 40:
            return 'high'
        
        # Check for medium priority keywords
        if any(keyword in rec_lower for keyword in medium_priority_keywords):
            return 'medium'
        
        # Default to medium if score is low-medium
        if score < 70:
            return 'medium'
        
        return 'low'
