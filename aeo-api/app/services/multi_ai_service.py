"""
Multi-AI Provider Service
Analyzes content understanding across OpenAI, Gemini, and Claude
"""

import os
import json
import logging
from typing import Dict, List, Optional
from openai import OpenAI
import google.generativeai as genai
import anthropic

class MultiAIService:
    """Service for multi-AI provider content analysis"""
    
    def __init__(self):
        self.openai_client = None
        self.gemini_client = None
        self.claude_client = None
        
        # Initialize OpenAI
        if os.getenv('OPENAI_API_KEY'):
            try:
                self.openai_client = OpenAI()
                logging.info("OpenAI client initialized")
            except Exception as e:
                logging.error(f"OpenAI initialization failed: {str(e)}")
        
        # Initialize Gemini
        if os.getenv('GEMINI_API_KEY'):
            try:
                print("Initializing Gemini client")
                genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
                self.gemini_client = genai.GenerativeModel('gemini-2.0-flash-exp')
                logging.info("Gemini client initialized")
            except Exception as e:
                logging.error(f"Gemini initialization failed: {str(e)}")
        
        # Initialize Claude
        if os.getenv('CLAUDE_API_KEY'):
            try:
                print("Initializing Claude client")
                self.claude_client = anthropic.Anthropic(api_key=os.getenv('CLAUDE_API_KEY'))
                logging.info("Claude client initialized")
            except Exception as e:
                logging.error(f"Claude initialization failed: {str(e)}")
    
    def analyze_content_understanding(self, content: str, url: str) -> Dict:
        """
        Analyze content understanding across all available AI providers
        """
        results = {
            'openai': None,
            'gemini': None,
            'claude': None,
            'comparison': {},
            'best_provider': None,
            'overall_score': 0
        }
        
        # Analyze with OpenAI
        if self.openai_client:
            try:
                results['openai'] = self._analyze_with_openai(content, url)
            except Exception as e:
                logging.error(f"OpenAI analysis failed: {str(e)}")
                results['openai'] = {'error': str(e), 'score': 0}
        
        # Analyze with Gemini
        if self.gemini_client:
            try:
                results['gemini'] = self._analyze_with_gemini(content, url)
            except Exception as e:
                logging.error(f"Gemini analysis failed: {str(e)}")
                results['gemini'] = {'error': str(e), 'score': 0}
        
        # Analyze with Claude
        if self.claude_client:
            try:
                results['claude'] = self._analyze_with_claude(content, url)
            except Exception as e:
                logging.error(f"Claude analysis failed: {str(e)}")
                results['claude'] = {'error': str(e), 'score': 0}
        
        # Compare results and find best provider
        results['comparison'] = self._compare_providers(results)
        results['best_provider'] = self._get_best_provider(results)
        results['overall_score'] = self._calculate_overall_score(results)
        
        return results
    
    def _analyze_with_openai(self, content: str, url: str) -> Dict:
        """Analyze content with OpenAI"""
        # Truncate content to reduce costs
        max_content_length = 2000
        if len(content) > max_content_length:
            content = content[:max_content_length] + "..."
        
        prompt = f"""Analyze this content for AI understanding. URL: {url}

Content: {content}

Rate understanding level (Poor/Fair/Good/Excellent), key topics (top 3), clarity score (0-100), main issues, and recommendations.

JSON format:
{{
    "understanding_level": "string",
    "key_topics": ["topic1", "topic2", "topic3"],
    "clarity_score": number,
    "main_issues": ["issue1", "issue2"],
    "recommendations": ["rec1", "rec2"]
}}"""
        
        response = self.openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "AI content analyst. Analyze for understanding. JSON only."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            max_tokens=400,
            temperature=0.3
        )
        
        result = json.loads(response.choices[0].message.content.strip())
        
        # Calculate score based on understanding level
        understanding_scores = {
            'Poor': 20,
            'Fair': 40,
            'Good': 70,
            'Excellent': 90
        }
        
        score = understanding_scores.get(result.get('understanding_level', 'Poor'), 20)
        
        return {
            'provider': 'OpenAI',
            'score': score,
            'understanding_level': result.get('understanding_level', 'Unknown'),
            'key_topics': result.get('key_topics', []),
            'clarity_score': result.get('clarity_score', 0),
            'main_issues': result.get('main_issues', []),
            'recommendations': result.get('recommendations', []),
            'ai_feedback': response.choices[0].message.content
        }
    
    def _analyze_with_gemini(self, content: str, url: str) -> Dict:
        """Analyze content with Gemini"""
        # Truncate content
        max_content_length = 2000
        if len(content) > max_content_length:
            content = content[:max_content_length] + "..."
        
        prompt = f"""Analyze this content for AI understanding. URL: {url}

Content: {content}

Rate understanding level (Poor/Fair/Good/Excellent), key topics (top 3), clarity score (0-100), main issues, and recommendations.

Respond in JSON format:
{{
    "understanding_level": "string",
    "key_topics": ["topic1", "topic2", "topic3"],
    "clarity_score": number,
    "main_issues": ["issue1", "issue2"],
    "recommendations": ["rec1", "rec2"]
}}"""
        
        response = self.gemini_client.generate_content(prompt)
        
        try:
            # Extract JSON from response
            response_text = response.text
            # Find JSON in response
            start = response_text.find('{')
            end = response_text.rfind('}') + 1
            json_text = response_text[start:end]
            result = json.loads(json_text)
        except:
            # Fallback parsing
            result = {
                'understanding_level': 'Fair',
                'key_topics': ['Content Analysis'],
                'clarity_score': 50,
                'main_issues': ['Parsing error'],
                'recommendations': ['Improve content structure']
            }
        
        # Calculate score
        understanding_scores = {
            'Poor': 20,
            'Fair': 40,
            'Good': 70,
            'Excellent': 90
        }
        
        score = understanding_scores.get(result.get('understanding_level', 'Fair'), 40)
        
        return {
            'provider': 'Gemini',
            'score': score,
            'understanding_level': result.get('understanding_level', 'Unknown'),
            'key_topics': result.get('key_topics', []),
            'clarity_score': result.get('clarity_score', 0),
            'main_issues': result.get('main_issues', []),
            'recommendations': result.get('recommendations', []),
            'ai_feedback': response.text
        }
    
    def _analyze_with_claude(self, content: str, url: str) -> Dict:
        """Analyze content with Claude"""
        # Truncate content
        max_content_length = 2000
        if len(content) > max_content_length:
            content = content[:max_content_length] + "..."
        
        prompt = f"""Analyze this content for AI understanding. URL: {url}

Content: {content}

Rate understanding level (Poor/Fair/Good/Excellent), key topics (top 3), clarity score (0-100), main issues, and recommendations.

Respond in JSON format:
{{
    "understanding_level": "string",
    "key_topics": ["topic1", "topic2", "topic3"],
    "clarity_score": number,
    "main_issues": ["issue1", "issue2"],
    "recommendations": ["rec1", "rec2"]
}}"""
        
        response = self.claude_client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=400,
            temperature=0.3,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        
        try:
            result = json.loads(response.content[0].text)
        except:
            # Fallback parsing
            result = {
                'understanding_level': 'Fair',
                'key_topics': ['Content Analysis'],
                'clarity_score': 50,
                'main_issues': ['Parsing error'],
                'recommendations': ['Improve content structure']
            }
        
        # Calculate score
        understanding_scores = {
            'Poor': 20,
            'Fair': 40,
            'Good': 70,
            'Excellent': 90
        }
        
        score = understanding_scores.get(result.get('understanding_level', 'Fair'), 40)
        
        return {
            'provider': 'Claude',
            'score': score,
            'understanding_level': result.get('understanding_level', 'Unknown'),
            'key_topics': result.get('key_topics', []),
            'clarity_score': result.get('clarity_score', 0),
            'main_issues': result.get('main_issues', []),
            'recommendations': result.get('recommendations', []),
            'ai_feedback': response.content[0].text
        }
    
    def _compare_providers(self, results: Dict) -> Dict:
        """Compare results across providers"""
        comparison = {
            'scores': {},
            'understanding_levels': {},
            'clarity_scores': {},
            'topics_overlap': {},
            'recommendations_summary': []
        }
        
        for provider, data in results.items():
            if provider in ['openai', 'gemini', 'claude'] and data and 'error' not in data:
                comparison['scores'][provider] = data.get('score', 0)
                comparison['understanding_levels'][provider] = data.get('understanding_level', 'Unknown')
                comparison['clarity_scores'][provider] = data.get('clarity_score', 0)
        
        # Find topic overlap
        all_topics = []
        for provider, data in results.items():
            if provider in ['openai', 'gemini', 'claude'] and data and 'error' not in data:
                all_topics.extend(data.get('key_topics', []))
        
        # Count topic frequency
        topic_counts = {}
        for topic in all_topics:
            topic_counts[topic] = topic_counts.get(topic, 0) + 1
        
        comparison['topics_overlap'] = {
            topic: count for topic, count in topic_counts.items() if count > 1
        }
        
        # Aggregate recommendations
        all_recommendations = []
        for provider, data in results.items():
            if provider in ['openai', 'gemini', 'claude'] and data and 'error' not in data:
                all_recommendations.extend(data.get('recommendations', []))
        
        # Remove duplicates and keep unique recommendations
        comparison['recommendations_summary'] = list(set(all_recommendations))
        
        return comparison
    
    def _get_best_provider(self, results: Dict) -> str:
        """Determine which provider gave the best understanding"""
        best_provider = None
        best_score = 0
        
        for provider, data in results.items():
            if provider in ['openai', 'gemini', 'claude'] and data and 'error' not in data:
                score = data.get('score', 0)
                if score > best_score:
                    best_score = score
                    best_provider = provider
        
        return best_provider or 'none'
    
    def _calculate_overall_score(self, results: Dict) -> int:
        """Calculate overall AI understanding score"""
        scores = []
        for provider, data in results.items():
            if provider in ['openai', 'gemini', 'claude'] and data and 'error' not in data:
                scores.append(data.get('score', 0))
        
        if scores:
            return sum(scores) // len(scores)  # Average score
        return 0
