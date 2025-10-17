"""
OpenAI Integration Service
Provides AI-powered content analysis and understanding
"""

import os
import re
from typing import Dict, List, Optional
from openai import OpenAI
import logging

class OpenAIService:
    """Service for OpenAI-powered content analysis"""
    
    def __init__(self):
        self.client = None
        self.api_key = os.getenv('OPENAI_API_KEY')
        
        if self.api_key:
            try:
                self.client = OpenAI()
                logging.info("OpenAI client initialized successfully")
            except Exception as e:
                logging.error(f"Failed to initialize OpenAI client: {str(e)}")
                self.client = None
        else:
            logging.warning("OPENAI_API_KEY not found in environment variables")
    
    def _is_available(self) -> bool:
        """Check if OpenAI service is available"""
        return self.client is not None
    
    def analyze_content_understanding(self, content: str, url: str) -> Dict:
        """
        Analyze if AI can understand the content clearly
        """
        if not self._is_available():
            return {
                'score': 0,
                'error': 'OpenAI service not available',
                'understanding_level': 'unknown',
                'key_topics': [],
                'clarity_score': 0,
                'recommendations': ['Configure OpenAI API key']
            }
        
        try:
            # Truncate content if too long (OpenAI has token limits)
            max_content_length = 8000  # Conservative limit
            if len(content) > max_content_length:
                content = content[:max_content_length] + "..."
            
            prompt = f"""
            Analyze this web content for AI understanding and clarity. The URL is: {url}
            
            Content:
            {content}
            
            Please provide:
            1. Understanding level (Poor/Fair/Good/Excellent)
            2. Key topics identified (list top 5)
            3. Clarity score (0-100)
            4. Main issues that might confuse AI
            5. Recommendations for better AI understanding
            
            Respond in JSON format:
            {{
                "understanding_level": "string",
                "key_topics": ["topic1", "topic2", ...],
                "clarity_score": number,
                "main_issues": ["issue1", "issue2", ...],
                "recommendations": ["rec1", "rec2", ...]
            }}
            """
            
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo-1106",  # Use newer model with JSON support
                messages=[
                    {"role": "system", "content": "You are an AI content analyst. Analyze web content for AI understanding and provide structured feedback in JSON format only."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},  # Force JSON response
                max_tokens=1000,
                temperature=0.3
            )
            
            # Parse JSON response
            import json
            response_content = response.choices[0].message.content.strip()
            
            # Log the raw response for debugging
            logging.debug(f"OpenAI response: {response_content[:200]}...")
            
            result = json.loads(response_content)
            
            # Calculate score based on understanding level
            understanding_scores = {
                'Poor': 20,
                'Fair': 40,
                'Good': 70,
                'Excellent': 90
            }
            
            score = understanding_scores.get(result.get('understanding_level', 'Poor'), 20)
            
            return {
                'score': score,
                'understanding_level': result.get('understanding_level', 'Unknown'),
                'key_topics': result.get('key_topics', []),
                'clarity_score': result.get('clarity_score', 0),
                'main_issues': result.get('main_issues', []),
                'recommendations': result.get('recommendations', []),
                'ai_feedback': response.choices[0].message.content
            }
            
        except Exception as e:
            logging.error(f"OpenAI content understanding analysis failed: {str(e)}")
            return {
                'score': 0,
                'error': f'Analysis failed: {str(e)}',
                'understanding_level': 'unknown',
                'key_topics': [],
                'clarity_score': 0,
                'recommendations': ['Retry analysis or check API configuration']
            }
    
    def analyze_tone_and_sentiment(self, content: str) -> Dict:
        """
        Analyze content tone and sentiment using OpenAI
        """
        if not self._is_available():
            return {
                'score': 0,
                'error': 'OpenAI service not available',
                'tone': 'unknown',
                'sentiment': 'neutral',
                'recommendations': ['Configure OpenAI API key']
            }
        
        try:
            # Truncate content if too long
            max_content_length = 6000
            if len(content) > max_content_length:
                content = content[:max_content_length] + "..."
            
            prompt = f"""
            Analyze the tone and sentiment of this content:
            
            {content}
            
            Provide:
            1. Tone (Professional, Casual, Academic, Technical, Friendly, etc.)
            2. Sentiment (Positive, Negative, Neutral)
            3. Confidence level (0-100)
            4. Key emotional indicators
            5. Recommendations for better tone
            
            Respond in JSON format:
            {{
                "tone": "string",
                "sentiment": "string",
                "confidence": number,
                "emotional_indicators": ["indicator1", "indicator2", ...],
                "recommendations": ["rec1", "rec2", ...]
            }}
            """
            
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo-1106",  # Use newer model with JSON support
                messages=[
                    {"role": "system", "content": "You are a content tone and sentiment analyst. Analyze text for tone, sentiment, and emotional indicators. Respond in JSON format only."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},  # Force JSON response
                max_tokens=500,
                temperature=0.3
            )
            
            import json
            response_content = response.choices[0].message.content.strip()
            logging.debug(f"OpenAI tone analysis response: {response_content[:200]}...")
            result = json.loads(response_content)
            
            # Calculate score based on sentiment and tone appropriateness
            sentiment_scores = {'Positive': 80, 'Neutral': 60, 'Negative': 20}
            tone_scores = {'Professional': 90, 'Academic': 85, 'Technical': 80, 'Friendly': 75, 'Casual': 60}
            
            sentiment_score = sentiment_scores.get(result.get('sentiment', 'Neutral'), 60)
            tone_score = tone_scores.get(result.get('tone', 'Casual'), 50)
            
            # Average the scores
            score = (sentiment_score + tone_score) // 2
            
            return {
                'score': score,
                'tone': result.get('tone', 'Unknown'),
                'sentiment': result.get('sentiment', 'Neutral'),
                'confidence': result.get('confidence', 0),
                'emotional_indicators': result.get('emotional_indicators', []),
                'recommendations': result.get('recommendations', []),
                'ai_feedback': response.choices[0].message.content
            }
            
        except Exception as e:
            logging.error(f"OpenAI tone analysis failed: {str(e)}")
            return {
                'score': 0,
                'error': f'Tone analysis failed: {str(e)}',
                'tone': 'unknown',
                'sentiment': 'neutral',
                'recommendations': ['Retry analysis or check API configuration']
            }
    
    def analyze_answerability(self, content: str, questions: List[str] = None) -> Dict:
        """
        Analyze content answerability using AI feedback
        """
        if not self._is_available():
            return {
                'score': 0,
                'error': 'OpenAI service not available',
                'ai_answerability_score': 0,
                'gpt_feedback': 'Service not available',
                'recommendations': ['Configure OpenAI API key']
            }
        
        try:
            # Truncate content if too long
            max_content_length = 6000
            if len(content) > max_content_length:
                content = content[:max_content_length] + "..."
            
            # Generate questions if not provided
            if not questions:
                questions = [
                    "What is the main topic of this content?",
                    "What problem does this content solve?",
                    "What are the key benefits mentioned?",
                    "What action should the reader take?"
                ]
            
            prompt = f"""
            Analyze this content for answerability and question-answering quality:
            
            Content:
            {content}
            
            Test Questions:
            {chr(10).join(f"- {q}" for q in questions)}
            
            Evaluate:
            1. How well does the content answer these questions? (0-100)
            2. What questions are answered clearly?
            3. What questions are not answered or unclear?
            4. Overall answerability score (0-100)
            5. Recommendations for better answerability
            
            Respond in JSON format:
            {{
                "ai_answerability_score": number,
                "answered_questions": ["question1", "question2", ...],
                "unanswered_questions": ["question1", "question2", ...],
                "clarity_issues": ["issue1", "issue2", ...],
                "recommendations": ["rec1", "rec2", ...]
            }}
            """
            
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo-1106",  # Use newer model with JSON support
                messages=[
                    {"role": "system", "content": "You are a content answerability analyst. Evaluate how well content answers questions and provides clear information. Respond in JSON format only."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},  # Force JSON response
                max_tokens=800,
                temperature=0.3
            )
            
            import json
            response_content = response.choices[0].message.content.strip()
            logging.debug(f"OpenAI answerability response: {response_content[:200]}...")
            result = json.loads(response_content)
            
            return {
                'score': result.get('ai_answerability_score', 0),
                'ai_answerability_score': result.get('ai_answerability_score', 0),
                'answered_questions': result.get('answered_questions', []),
                'unanswered_questions': result.get('unanswered_questions', []),
                'clarity_issues': result.get('clarity_issues', []),
                'recommendations': result.get('recommendations', []),
                'gpt_feedback': response.choices[0].message.content
            }
            
        except Exception as e:
            logging.error(f"OpenAI answerability analysis failed: {str(e)}")
            return {
                'score': 0,
                'error': f'Answerability analysis failed: {str(e)}',
                'ai_answerability_score': 0,
                'gpt_feedback': 'Analysis failed',
                'recommendations': ['Retry analysis or check API configuration']
            }
    
    def generate_content_summary(self, content: str, max_length: int = 200) -> str:
        """
        Generate AI-powered content summary
        """
        if not self._is_available():
            return "OpenAI service not available for summarization"
        
        try:
            # Truncate content if too long
            max_content_length = 4000
            if len(content) > max_content_length:
                content = content[:max_content_length] + "..."
            
            prompt = f"""
            Summarize this web content in {max_length} characters or less. Focus on the main points and key information:
            
            {content}
            """
            
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are a content summarizer. Create concise, informative summaries of web content."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=300,
                temperature=0.3
            )
            
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            logging.error(f"OpenAI summarization failed: {str(e)}")
            return f"Summarization failed: {str(e)}"
