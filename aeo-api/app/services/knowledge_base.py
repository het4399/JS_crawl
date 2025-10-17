"""
Knowledge Base Analysis Service
Analyzes content for entities, facts, and clarity
"""

import re
from typing import Dict, List, Set
from urllib.parse import urlparse

class KnowledgeBaseService:
    """Service for analyzing knowledge base and content quality"""
    
    def __init__(self):
        self.entity_patterns = {
            'people': r'\b[A-Z][a-z]+ [A-Z][a-z]+\b',  # Simple name pattern
            'places': r'\b[A-Z][a-z]+(?: [A-Z][a-z]+)*\b',  # Place names
            'organizations': r'\b[A-Z][a-z]+(?: [A-Z][a-z]+)* (?:Inc|Corp|LLC|Ltd|Company|Organization)\b',
            'dates': r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b',
            'years': r'\b(?:19|20)\d{2}\b',
            'percentages': r'\b\d+(?:\.\d+)?%\b',
            'numbers': r'\b\d+(?:,\d{3})*(?:\.\d+)?\b'
        }
    
    def _extract_entities(self, text: str) -> Dict[str, List[str]]:
        """Extract entities from text using regex patterns"""
        entities = {}
        
        for entity_type, pattern in self.entity_patterns.items():
            matches = re.findall(pattern, text, re.IGNORECASE)
            entities[entity_type] = list(set(matches))  # Remove duplicates
        
        return entities
    
    def _calculate_fact_density(self, text: str) -> float:
        """Calculate fact density based on numbers, dates, and specific terms"""
        fact_indicators = [
            r'\b\d+(?:,\d{3})*(?:\.\d+)?\b',  # Numbers
            r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b',  # Dates
            r'\b(?:19|20)\d{2}\b',  # Years
            r'\b\d+(?:\.\d+)?%\b',  # Percentages
            r'\b(?:million|billion|thousand|hundred)\b',  # Quantifiers
            r'\b(?:according to|studies show|research indicates|data shows)\b'  # Fact indicators
        ]
        
        total_facts = 0
        for pattern in fact_indicators:
            total_facts += len(re.findall(pattern, text, re.IGNORECASE))
        
        word_count = len(text.split())
        return (total_facts / word_count * 100) if word_count > 0 else 0
    
    def _extract_facts(self, text: str) -> List[Dict[str, str]]:
        """Extract candidate factual statements (simple heuristic)."""
        # Split into sentences crudely
        sentences = re.split(r'[.!?]+\s+', text)
        sentences = [s.strip() for s in sentences if s and len(s.strip()) > 0]

        fact_triggers = [
            r'\b\d+(?:,\d{3})*(?:\.\d+)?\b',
            r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b',
            r'\b(?:19|20)\d{2}\b',
            r'\b\d+(?:\.\d+)?%\b',
            r'\b(?:according to|studies show|research indicates|data shows)\b',
        ]

        # Terms that suggest JS/analytics/noise to skip
        noise_patterns = [
            r'\b(?:window|document|function|var|let|const|gtag|dataLayer|google-analytics|googletag)\b',
            r'\b(?:jQuery|\$\(|owlCarousel|addEventListener|onclick|script)\b',
            r'\bmailto:|@\w+\.\w+\b',
            r'\{\s*\}|=>|<\/?\w+[^>]*>'
        ]

        facts: List[Dict[str, str]] = []
        for s in sentences:
            trigger_matched = None
            for pat in fact_triggers:
                if re.search(pat, s, re.IGNORECASE):
                    trigger_matched = pat
                    break
            if trigger_matched:
                # Skip if sentence looks like code/JS/noise
                if any(re.search(pn, s, re.IGNORECASE) for pn in noise_patterns):
                    continue
                # Require some alphabetic content and a reasonable length
                if not re.search(r'[A-Za-z]', s):
                    continue
                if len(s.split()) < 6:
                    continue
                facts.append({
                    'statement': s[:300],  # cap length
                    'trigger': trigger_matched
                })
        return facts[:50]
    
    def _assess_clarity(self, text: str) -> Dict[str, float]:
        """Assess content clarity metrics"""
        sentences = re.split(r'[.!?]+', text)
        sentences = [s.strip() for s in sentences if s.strip()]
        
        if not sentences:
            return {'avg_sentence_length': 0, 'clarity_score': 0}
        
        # Calculate average sentence length
        avg_sentence_length = sum(len(s.split()) for s in sentences) / len(sentences)
        
        # Clarity indicators
        clarity_indicators = [
            r'\b(?:therefore|however|moreover|furthermore|consequently)\b',  # Transition words
            r'\b(?:for example|for instance|such as|including)\b',  # Examples
            r'\b(?:in other words|that is|specifically)\b',  # Clarifications
            r'\b(?:first|second|third|finally|next|then)\b'  # Structure words
        ]
        
        clarity_score = 0
        for pattern in clarity_indicators:
            clarity_score += len(re.findall(pattern, text, re.IGNORECASE))
        
        # Normalize clarity score (0-100)
        clarity_score = min(100, (clarity_score / len(sentences)) * 20)
        
        return {
            'avg_sentence_length': avg_sentence_length,
            'clarity_score': clarity_score,
            'sentence_count': len(sentences)
        }
    
    def _assess_linkability(self, text: str) -> Dict[str, int]:
        """Assess content linkability potential"""
        # Look for potential link targets
        linkable_terms = [
            r'\b(?:website|site|page|article|blog|post)\b',
            r'\b(?:company|organization|business|firm)\b',
            r'\b(?:product|service|solution|offering)\b',
            r'\b(?:contact|email|phone|address)\b',
            r'\b(?:learn more|read more|find out|discover)\b'
        ]
        
        linkability_score = 0
        for pattern in linkable_terms:
            linkability_score += len(re.findall(pattern, text, re.IGNORECASE))
        
        return {
            'linkability_score': min(100, linkability_score * 5),
            'linkable_terms_found': linkability_score
        }
    
    def _analyze_format_usage(self, text: str) -> Dict[str, int]:
        """Analyze usage of different content formats"""
        formats = {
            'headings': len(re.findall(r'^#{1,6}\s+', text, re.MULTILINE)),
            'lists': len(re.findall(r'^\s*[-*+]\s+', text, re.MULTILINE)) + len(re.findall(r'^\s*\d+\.\s+', text, re.MULTILINE)),
            'bold': len(re.findall(r'\*\*[^*]+\*\*', text)) + len(re.findall(r'__[^_]+__', text)),
            'italic': len(re.findall(r'\*[^*]+\*', text)) + len(re.findall(r'_[^_]+_', text)),
            'code': len(re.findall(r'`[^`]+`', text)),
            'links': len(re.findall(r'\[([^\]]+)\]\([^)]+\)', text))
        }
        
        return formats
    
    def analyze_knowledge_base(self, url: str, html_content: str) -> Dict:
        """Analyze knowledge base quality and content structure"""
        try:
            # Remove scripts/styles/noscript and comments first
            cleaned = re.sub(r'<!--.*?-->', ' ', html_content, flags=re.DOTALL)
            cleaned = re.sub(r'<script[\s\S]*?</script>', ' ', cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r'<style[\s\S]*?</style>', ' ', cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r'<noscript[\s\S]*?</noscript>', ' ', cleaned, flags=re.IGNORECASE)
            # Extract text content
            text_content = re.sub(r'<[^>]+>', ' ', cleaned)
            text_content = re.sub(r'\s+', ' ', text_content).strip()
            
            if not text_content:
                return {
                    'score': 0,
                    'error': 'No text content found',
                    'entities': {},
                    'fact_density': 0,
                    'clarity': {},
                    'linkability': {},
                    'format_usage': {},
                    'recommendations': ['Add more text content']
                }
            
            # Extract entities
            entities = self._extract_entities(text_content)
            
            # Calculate fact density
            fact_density = self._calculate_fact_density(text_content)
            
            # Assess clarity
            clarity_metrics = self._assess_clarity(text_content)
            
            # Assess linkability
            linkability_metrics = self._assess_linkability(text_content)
            
            # Analyze format usage
            format_usage = self._analyze_format_usage(text_content)

            # Extract factual statements
            facts = self._extract_facts(text_content)
            
            # Calculate overall score
            score = 0
            score += min(25, fact_density * 2)  # Fact density (0-25 points)
            score += min(25, clarity_metrics['clarity_score'])  # Clarity (0-25 points)
            score += min(25, linkability_metrics['linkability_score'])  # Linkability (0-25 points)
            score += min(25, min(100, sum(format_usage.values()) * 2))  # Format usage (0-25 points)
            
            # Generate recommendations
            recommendations = []
            if fact_density < 2:
                recommendations.append('Add more factual content with numbers, dates, and statistics')
            if clarity_metrics['clarity_score'] < 50:
                recommendations.append('Improve content clarity with better structure and transitions')
            if linkability_metrics['linkability_score'] < 30:
                recommendations.append('Add more linkable content and internal linking opportunities')
            if sum(format_usage.values()) < 5:
                recommendations.append('Use more formatting elements like headings, lists, and emphasis')
            
            return {
                'score': min(100, score),
                'entities': entities,
                'facts': facts,
                'fact_density': fact_density,
                'clarity': clarity_metrics,
                'linkability': linkability_metrics,
                'format_usage': format_usage,
                'recommendations': recommendations
            }
            
        except Exception as e:
            return {
                'score': 0,
                'error': f'Knowledge base analysis failed: {str(e)}',
                'entities': {},
                'fact_density': 0,
                'clarity': {},
                'linkability': {},
                'format_usage': {},
                'recommendations': ['Retry analysis']
            }
