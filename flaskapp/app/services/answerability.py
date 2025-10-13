"""
Answerability Analysis Service
Analyzes content for question-answering potential and structure
"""

import re
from typing import Dict, List, Tuple
from urllib.parse import urlparse

class AnswerabilityService:
    """Service for analyzing content answerability and question structure"""
    
    def __init__(self):
        self.question_patterns = [
            r'^#{1,6}\s*[Ww]hat\s+',
            r'^#{1,6}\s*[Hh]ow\s+',
            r'^#{1,6}\s*[Ww]hy\s+',
            r'^#{1,6}\s*[Ww]hen\s+',
            r'^#{1,6}\s*[Ww]here\s+',
            r'^#{1,6}\s*[Ww]ho\s+',
            r'^#{1,6}\s*[Ww]hich\s+',
            r'^#{1,6}\s*[Cc]an\s+',
            r'^#{1,6}\s*[Ss]hould\s+',
            r'^#{1,6}\s*[Ii]s\s+',
            r'^#{1,6}\s*[Aa]re\s+',
            r'^#{1,6}\s*[Dd]oes\s+',
            r'^#{1,6}\s*[Dd]o\s+',
            r'^#{1,6}\s*[Ww]ill\s+',
            r'^#{1,6}\s*[Cc]ould\s+',
            r'^#{1,6}\s*[Ww]ould\s+'
        ]
        
        self.answer_indicators = [
            r'\b(?:answer|solution|explanation|response)\b',
            r'\b(?:yes|no|true|false)\b',
            r'\b(?:because|due to|as a result|therefore)\b',
            r'\b(?:first|second|third|finally|next|then)\b',
            r'\b(?:for example|for instance|such as)\b',
            r'\b(?:according to|studies show|research indicates)\b'
        ]
    
    def _count_question_headings(self, html_content: str) -> int:
        """Count question-based headings in content"""
        question_count = 0
        for pattern in self.question_patterns:
            matches = re.findall(pattern, html_content, re.MULTILINE)
            question_count += len(matches)
        return question_count
    
    def _calculate_paragraph_lengths(self, html_content: str) -> Dict[str, float]:
        """Calculate average paragraph length and distribution"""
        # Extract paragraphs (simple approach)
        paragraphs = re.split(r'</p>|<br\s*/?>', html_content)
        paragraphs = [p.strip() for p in paragraphs if p.strip()]
        
        if not paragraphs:
            return {'avg_length': 0, 'short_paragraphs': 0, 'long_paragraphs': 0}
        
        paragraph_lengths = [len(p.split()) for p in paragraphs]
        avg_length = sum(paragraph_lengths) / len(paragraph_lengths)
        
        # Count short and long paragraphs
        short_paragraphs = sum(1 for length in paragraph_lengths if length < 50)
        long_paragraphs = sum(1 for length in paragraph_lengths if length > 200)
        
        return {
            'avg_length': avg_length,
            'short_paragraphs': short_paragraphs,
            'long_paragraphs': long_paragraphs,
            'total_paragraphs': len(paragraphs)
        }
    
    def _analyze_content_tone(self, text_content: str) -> Dict[str, float]:
        """Analyze content tone and style"""
        # Positive tone indicators
        positive_indicators = [
            r'\b(?:excellent|great|amazing|wonderful|fantastic|outstanding)\b',
            r'\b(?:benefit|advantage|improve|enhance|boost)\b',
            r'\b(?:success|achieve|accomplish|succeed)\b'
        ]
        
        # Negative tone indicators
        negative_indicators = [
            r'\b(?:problem|issue|challenge|difficulty|struggle)\b',
            r'\b(?:fail|failure|error|mistake|wrong)\b',
            r'\b(?:bad|terrible|awful|horrible|disappointing)\b'
        ]
        
        # Neutral tone indicators
        neutral_indicators = [
            r'\b(?:information|data|fact|detail|specific)\b',
            r'\b(?:process|method|approach|technique)\b',
            r'\b(?:analysis|evaluation|assessment|review)\b'
        ]
        
        positive_score = sum(len(re.findall(pattern, text_content, re.IGNORECASE)) for pattern in positive_indicators)
        negative_score = sum(len(re.findall(pattern, text_content, re.IGNORECASE)) for pattern in negative_indicators)
        neutral_score = sum(len(re.findall(pattern, text_content, re.IGNORECASE)) for pattern in neutral_indicators)
        
        total_score = positive_score + negative_score + neutral_score
        if total_score == 0:
            return {'tone': 'neutral', 'confidence': 0}
        
        if positive_score > negative_score and positive_score > neutral_score:
            tone = 'positive'
            confidence = positive_score / total_score
        elif negative_score > positive_score and negative_score > neutral_score:
            tone = 'negative'
            confidence = negative_score / total_score
        else:
            tone = 'neutral'
            confidence = neutral_score / total_score
        
        return {
            'tone': tone,
            'confidence': confidence,
            'positive_score': positive_score,
            'negative_score': negative_score,
            'neutral_score': neutral_score
        }
    
    def _count_answer_structures(self, html_content: str) -> Dict[str, int]:
        """Count various answer structures in content"""
        structures = {
            'bullet_lists': len(re.findall(r'<ul[^>]*>.*?</ul>', html_content, re.DOTALL)),
            'numbered_lists': len(re.findall(r'<ol[^>]*>.*?</ol>', html_content, re.DOTALL)),
            'short_answers': len(re.findall(r'<p[^>]*>.*?</p>', html_content, re.DOTALL)),
            'faq_sections': len(re.findall(r'<div[^>]*class[^>]*faq[^>]*>', html_content, re.IGNORECASE)),
            'answer_indicators': sum(len(re.findall(pattern, html_content, re.IGNORECASE)) for pattern in self.answer_indicators)
        }
        
        return structures

    def _extract_qa_pairs(self, html_content: str) -> List[Dict[str, str]]:
        """Extract simple Q/A pairs from headings and following paragraphs."""
        qa: List[Dict[str, str]] = []
        try:
            # Find question-like headings
            question_heading_regex = r'<h[1-6][^>]*>(.*?)</h[1-6]>'
            headings = re.findall(question_heading_regex, html_content, re.IGNORECASE | re.DOTALL)
            # Split paragraphs
            paragraphs = re.findall(r'<p[^>]*>(.*?)</p>', html_content, re.IGNORECASE | re.DOTALL)

            # Heuristic: pair each question-like heading with the next paragraph if close
            for h in headings:
                h_text = re.sub(r'<[^>]+>', ' ', h)
                h_text = re.sub(r'\s+', ' ', h_text).strip()
                if not re.match(r'^(what|how|why|when|where|who|which|can|should|is|are|does|do|will|could|would)\b', h_text, re.IGNORECASE):
                    continue
                # Find a candidate answer
                answer_text = ''
                for p in paragraphs:
                    pt = re.sub(r'<[^>]+>', ' ', p)
                    pt = re.sub(r'\s+', ' ', pt).strip()
                    if len(pt) > 20:
                        answer_text = pt
                        break
                if h_text and answer_text:
                    qa.append({
                        'question': h_text[:200],
                        'answer': answer_text[:400]
                    })
        except Exception:
            pass
        return qa[:50]
    
    def _assess_ai_crawler_points(self, html_content: str) -> Dict[str, int]:
        """Assess AI crawler specific points"""
        ai_indicators = {
            'structured_data': len(re.findall(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>', html_content, re.IGNORECASE)),
            'meta_descriptions': len(re.findall(r'<meta[^>]*name=["\']description["\'][^>]*>', html_content, re.IGNORECASE)),
            'heading_structure': len(re.findall(r'<h[1-6][^>]*>', html_content, re.IGNORECASE)),
            'internal_links': len(re.findall(r'<a[^>]*href=["\'][^"\']*["\'][^>]*>', html_content, re.IGNORECASE)),
            'images_with_alt': len(re.findall(r'<img[^>]*alt=["\'][^"\']*["\'][^>]*>', html_content, re.IGNORECASE))
        }
        
        return ai_indicators
    
    def analyze_answerability(self, url: str, html_content: str) -> Dict:
        """Analyze content answerability and question-answering potential"""
        try:
            # Extract text content for analysis
            text_content = re.sub(r'<[^>]+>', ' ', html_content)
            text_content = re.sub(r'\s+', ' ', text_content).strip()
            
            if not text_content:
                return {
                    'score': 0,
                    'error': 'No content found',
                    'question_headings': 0,
                    'paragraph_analysis': {},
                    'tone_analysis': {},
                    'answer_structures': {},
                    'ai_crawler_points': {},
                    'recommendations': ['Add more content']
                }
            
            # Count question headings
            question_headings = self._count_question_headings(html_content)
            
            # Analyze paragraph lengths
            paragraph_analysis = self._calculate_paragraph_lengths(html_content)
            
            # Analyze content tone
            tone_analysis = self._analyze_content_tone(text_content)
            
            # Count answer structures
            answer_structures = self._count_answer_structures(html_content)
            
            # Assess AI crawler points
            ai_crawler_points = self._assess_ai_crawler_points(html_content)

            # Extract Q/A pairs
            qa_pairs = self._extract_qa_pairs(html_content)
            
            # Calculate answerability score
            score = 0
            
            # Question headings (0-25 points)
            score += min(25, question_headings * 5)
            
            # Paragraph structure (0-20 points)
            if paragraph_analysis['avg_length'] > 0:
                if 50 <= paragraph_analysis['avg_length'] <= 150:
                    score += 20
                elif 30 <= paragraph_analysis['avg_length'] <= 200:
                    score += 15
                else:
                    score += 10
            
            # Answer structures (0-25 points)
            structure_score = sum(answer_structures.values())
            score += min(25, structure_score * 2)
            
            # AI crawler points (0-30 points)
            crawler_score = sum(ai_crawler_points.values())
            score += min(30, crawler_score * 3)
            
            # Generate recommendations
            recommendations = []
            if question_headings < 3:
                recommendations.append('Add more question-based headings to improve answerability')
            if paragraph_analysis['avg_length'] > 200:
                recommendations.append('Break down long paragraphs into shorter, more digestible sections')
            if answer_structures['bullet_lists'] + answer_structures['numbered_lists'] < 2:
                recommendations.append('Add more lists and structured content for better answerability')
            if ai_crawler_points['structured_data'] < 1:
                recommendations.append('Add structured data markup to help AI crawlers understand content')
            if ai_crawler_points['meta_descriptions'] < 1:
                recommendations.append('Add meta descriptions for better AI understanding')
            
            return {
                'score': min(100, score),
                'question_headings': question_headings,
                'paragraph_analysis': paragraph_analysis,
                'tone_analysis': tone_analysis,
                'answer_structures': answer_structures,
                'ai_crawler_points': ai_crawler_points,
                'qa_pairs': qa_pairs,
                'recommendations': recommendations
            }
            
        except Exception as e:
            return {
                'score': 0,
                'error': f'Answerability analysis failed: {str(e)}',
                'question_headings': 0,
                'paragraph_analysis': {},
                'tone_analysis': {},
                'answer_structures': {},
                'ai_crawler_points': {},
                'recommendations': ['Retry analysis']
            }
