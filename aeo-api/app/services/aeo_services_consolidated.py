"""
AEO Services - Consolidated
Main service orchestrator that imports from separate service files
"""

from .ai_presence import AIPresenceService
from .competitor_analysis import CompetitorAnalysisService
from .knowledge_base import KnowledgeBaseService
from .answerability import AnswerabilityService
from .crawler_accessibility import CrawlerAccessibilityService

class AEOServiceOrchestrator:
    """Main orchestrator for all AEO analysis services"""
    
    def __init__(self):
        self.ai_presence_service = AIPresenceService()
        self.competitor_service = CompetitorAnalysisService()
        self.knowledge_base_service = KnowledgeBaseService()
        self.answerability_service = AnswerabilityService()
        self.crawler_accessibility_service = CrawlerAccessibilityService()
    
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
                'crawler_accessibility': self.analyze_crawler_accessibility(url, html_content)
            }
            
            # Add competitor analysis if URLs provided
            if competitor_urls:
                results['competitor_analysis'] = self.analyze_competitor_landscape(url, competitor_urls)
            
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
                    'crawler_accessibility': results.get('crawler_accessibility', {})
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
        """Generate recommendations from analysis results"""
        recommendations = []
        
        for key, analysis in results.items():
            if isinstance(analysis, dict) and 'recommendations' in analysis:
                recommendations.extend(analysis['recommendations'])
        
        return list(set(recommendations))  # Remove duplicates
