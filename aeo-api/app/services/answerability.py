"""
Answerability Analysis Service
Analyzes content for Q&A patterns and answerability
"""

import re
from typing import Dict, List
from bs4 import BeautifulSoup

class AnswerabilityService:
    """Service for analyzing answerability and Q&A content"""
    
    def __init__(self):
        self.question_patterns = [
            r'\b(?:what|how|why|when|where|who|which|can|could|would|should|is|are|do|does|did|will|have|has|had)\b',
            r'\?',
            r'\b(?:question|answer|faq|q&a|ask|inquiry)\b'
        ]
        
        self.answer_indicators = [
            r'\b(?:answer|solution|explanation|because|due to|as a result|therefore|thus|hence)\b',
            r'\b(?:step|process|method|way|approach|technique)\b',
            r'\b(?:first|second|third|next|then|finally|lastly)\b'
        ]
    
    def _extract_questions(self, text: str) -> List[Dict[str, str]]:
        """Extract potential questions from text"""
        questions = []
        
        # Split into sentences
        sentences = re.split(r'[.!?]+', text)
        
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence or len(sentence) < 10:
                continue
                
            # Check if sentence contains question indicators
            has_question_word = any(re.search(pattern, sentence, re.IGNORECASE) for pattern in self.question_patterns[:1])
            has_question_mark = '?' in sentence
            
            if has_question_word or has_question_mark:
                questions.append({
                    'question': sentence[:200],  # Limit length
                    'type': 'question_word' if has_question_word else 'question_mark'
                })
        
        return questions[:20]  # Limit to 20 questions
    
    def _extract_answers(self, text: str) -> List[Dict[str, str]]:
        """Extract potential answers from text"""
        answers = []
        
        # Split into sentences
        sentences = re.split(r'[.!?]+', text)
        
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence or len(sentence) < 15:
                continue
                
            # Check if sentence contains answer indicators
            has_answer_indicators = any(re.search(pattern, sentence, re.IGNORECASE) for pattern in self.answer_indicators)
            
            if has_answer_indicators:
                answers.append({
                    'answer': sentence[:300],  # Limit length
                    'confidence': 'high' if len([p for p in self.answer_indicators if re.search(p, sentence, re.IGNORECASE)]) > 1 else 'medium'
                })
        
        return answers[:15]  # Limit to 15 answers
    
    def _analyze_faq_structure(self, html_content: str) -> Dict[str, any]:
        """Analyze FAQ structure in HTML"""
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Look for FAQ patterns
            faq_indicators = [
                soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], string=re.compile(r'faq|question|q&a', re.IGNORECASE)),
                soup.find_all(['div', 'section'], class_=re.compile(r'faq|question|q&a', re.IGNORECASE)),
                soup.find_all(['dl', 'ul', 'ol'], class_=re.compile(r'faq|question|q&a', re.IGNORECASE))
            ]
            
            faq_elements = []
            for indicator_list in faq_indicators:
                faq_elements.extend(indicator_list)
            
            # Count Q&A pairs
            qa_pairs = 0
            for element in faq_elements:
                # Look for question-answer patterns
                if element.name in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
                    # Check if next sibling contains answer-like content
                    next_sibling = element.find_next_sibling()
                    if next_sibling and len(next_sibling.get_text().strip()) > 20:
                        qa_pairs += 1
                elif element.name in ['dl']:
                    # Definition lists often contain Q&A
                    dt_elements = element.find_all('dt')
                    dd_elements = element.find_all('dd')
                    qa_pairs += min(len(dt_elements), len(dd_elements))
            
            return {
                'faq_elements_found': len(faq_elements),
                'qa_pairs': qa_pairs,
                'has_faq_structure': len(faq_elements) > 0
            }
        except Exception:
            return {
                'faq_elements_found': 0,
                'qa_pairs': 0,
                'has_faq_structure': False
            }
    
    def _calculate_answerability_score(self, questions: List[Dict], answers: List[Dict], faq_structure: Dict) -> int:
        """Calculate overall answerability score"""
        score = 0
        
        # Questions (0-30 points)
        question_count = len(questions)
        if question_count > 0:
            score += min(30, question_count * 2)
        
        # Answers (0-30 points)
        answer_count = len(answers)
        if answer_count > 0:
            score += min(30, answer_count * 2)
        
        # FAQ Structure (0-20 points)
        if faq_structure['has_faq_structure']:
            score += 20
        elif faq_structure['qa_pairs'] > 0:
            score += 10
        
        # Q&A Balance (0-20 points)
        if question_count > 0 and answer_count > 0:
            balance_ratio = min(answer_count / question_count, 1.0)
            score += int(20 * balance_ratio)
        
        return min(100, score)
    
    def analyze_answerability(self, url: str, html_content: str) -> Dict:
        """Analyze answerability and Q&A content"""
        try:
            # Extract text content
            soup = BeautifulSoup(html_content, 'html.parser')
            text_content = soup.get_text()
            
            # Extract questions and answers
            questions = self._extract_questions(text_content)
            answers = self._extract_answers(text_content)
            
            # Analyze FAQ structure
            faq_structure = self._analyze_faq_structure(html_content)
            
            # Calculate score
            score = self._calculate_answerability_score(questions, answers, faq_structure)
            
            # Generate recommendations
            recommendations = []
            if len(questions) == 0:
                recommendations.append('Add more question-based content')
            if len(answers) == 0:
                recommendations.append('Provide clear answers and explanations')
            if not faq_structure['has_faq_structure']:
                recommendations.append('Create a dedicated FAQ section')
            if len(questions) > len(answers):
                recommendations.append('Ensure all questions have corresponding answers')
            
            return {
                'score': score,
                'questions': questions,
                'answers': answers,
                'faq_structure': faq_structure,
                'metrics': {
                    'question_count': len(questions),
                    'answer_count': len(answers),
                    'qa_balance': len(answers) / len(questions) if len(questions) > 0 else 0
                },
                'recommendations': recommendations
            }
            
        except Exception as e:
            return {
                'score': 0,
                'error': f'Answerability analysis failed: {str(e)}',
                'questions': [],
                'answers': [],
                'faq_structure': {'faq_elements_found': 0, 'qa_pairs': 0, 'has_faq_structure': False},
                'metrics': {'question_count': 0, 'answer_count': 0, 'qa_balance': 0},
                'recommendations': ['Retry analysis']
            }
