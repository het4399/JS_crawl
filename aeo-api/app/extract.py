from bs4 import BeautifulSoup
from readability import Document
import langdetect
from typing import List, Dict, Any, Tuple
from collections import Counter
import re

from .utils import (
    tokenize_phrase, calculate_prominence_boost, infer_intent, 
    choose_parent_keyword, build_hierarchy, TreeNode, jaccard_similarity
)
from .models import Keyword, TreeNode as TreeNodeModel

def create_sub_parents(keywords: List[Dict[str, Any]], parent_text: str) -> List[TreeNode]:
    """Group keywords into sub-parents based on similarity and themes"""
    if not keywords:
        return []
    
    # Sort keywords by score (highest first)
    sorted_keywords = sorted(keywords, key=lambda x: x["score"], reverse=True)
    
    sub_parents = []
    used_keywords = set()
    
    # Create sub-parents based on common themes
    themes = {
        "ai_related": ["ai", "chatbot", "automation", "intelligence", "machine"],
        "real_estate": ["real", "estate", "property", "housing", "investment"],
        "social_media": ["facebook", "whatsapp", "social", "messaging", "chat"],
        "business": ["business", "industry", "service", "solution", "client"],
        "technology": ["technology", "tech", "digital", "online", "platform"]
    }
    
    # Group keywords by themes
    for theme, theme_words in themes.items():
        theme_keywords = []
        for kw in sorted_keywords:
            if kw["text"] in used_keywords:
                continue
            kw_lower = kw["text"].lower()
            if any(theme_word in kw_lower for theme_word in theme_words):
                theme_keywords.append(kw)
                used_keywords.add(kw["text"])
        
        if theme_keywords:
            # Create sub-parent from the highest scoring keyword in this theme
            sub_parent_text = theme_keywords[0]["text"]
            sub_parent_score = theme_keywords[0]["score"]
            sub_parent = TreeNode(sub_parent_text, sub_parent_score)
            
            # Add remaining keywords as children
            for kw in theme_keywords[1:]:
                child_node = TreeNode(kw["text"], kw["score"])
                sub_parent.children.append(child_node)
            
            sub_parents.append(sub_parent)
    
    # Add remaining ungrouped keywords as individual sub-parents
    for kw in sorted_keywords:
        if kw["text"] not in used_keywords:
            sub_parent = TreeNode(kw["text"], kw["score"])
            sub_parents.append(sub_parent)
    
    return sub_parents

def extract_content_signals(html: str, url: str) -> Dict[str, Any]:
    """Extract content signals from HTML and URL (host + path tokens)"""
    soup = BeautifulSoup(html, "lxml")
    
    # Title
    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    
    # Meta description
    meta_desc = ""
    meta_desc_tag = soup.find("meta", attrs={"name": "description"})
    if meta_desc_tag and meta_desc_tag.get("content"):
        meta_desc = meta_desc_tag.get("content").strip()
    
    # Open Graph title and description
    og_title = ""
    og_desc = ""
    og_title_tag = soup.find("meta", property="og:title")
    if og_title_tag and og_title_tag.get("content"):
        og_title = og_title_tag.get("content").strip()
    
    og_desc_tag = soup.find("meta", property="og:description")
    if og_desc_tag and og_desc_tag.get("content"):
        og_desc = og_desc_tag.get("content").strip()
    
    # Headings
    headings = []
    for tag in ["h1", "h2", "h3", "h4", "h5", "h6"]:
        for element in soup.find_all(tag):
            text = element.get_text(separator=" ", strip=True)
            if text:
                headings.append({"level": tag, "text": text})
    
    # URL tokens (host without TLD + path segments)
    url_tokens = []
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        host = (parsed.hostname or "").split(".")
        host_tokens = [h for h in host if h and h not in {"www"}]
        path_tokens = [p for p in parsed.path.split("/") if p]
        url_tokens = host_tokens + path_tokens
    except Exception:
        pass
    
    return {
        "title": title,
        "meta_desc": meta_desc,
        "og_title": og_title,
        "og_desc": og_desc,
        "headings": headings,
        "url_tokens": url_tokens
    }

def extract_readable_text(html: str) -> str:
    """Extract main readable text using readability algorithm"""
    try:
        doc = Document(html)
        readable_html = doc.summary()
        if readable_html:
            soup = BeautifulSoup(readable_html, "lxml")
            return soup.get_text(separator=" ", strip=True)
    except Exception:
        pass
    
    # Fallback: remove scripts/styles and extract text
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript", "svg", "iframe"]):
        tag.extract()
    
    return soup.get_text(separator=" ", strip=True)

def preprocess_text(text: str, lang_guess: str = "") -> Tuple[str, str]:
    """Preprocess text and detect language"""
    # Combine text for language detection
    combined_text = text[:1000]  # Limit for performance
    
    try:
        if lang_guess:
            language = lang_guess
        else:
            language = langdetect.detect(combined_text)
    except Exception:
        language = "en"
    
    return text, language

def generate_candidates(text: str) -> List[str]:
    """Generate keyword candidates from text with improved filtering"""
    tokens = tokenize_phrase(text)
    
    # Generate n-grams
    unigrams = tokens
    bigrams = [" ".join([a, b]) for a, b in zip(tokens, tokens[1:])]
    trigrams = [" ".join([a, b, c]) for a, b, c in zip(tokens, tokens[1:], tokens[2:])]
    
    # Combine and deduplicate
    candidates = list(set(unigrams + bigrams + trigrams))
    
    # Enhanced filtering criteria
    filtered_candidates = []
    
    # Common stop words and low-value terms to exclude
    stop_phrases = {
        "click here", "read more", "learn more", "find out", "get started",
        "contact us", "about us", "home page", "main page", "site map",
        "privacy policy", "terms service", "cookie policy", "all rights reserved"
    }
    
    # Low-value single words
    low_value_words = {
        "page", "site", "website", "web", "online", "internet", "www", "http",
        "html", "css", "javascript", "php", "asp", "net", "com", "org", "edu",
        "click", "here", "more", "read", "learn", "find", "get", "start",
        "contact", "about", "home", "main", "map", "privacy", "terms", "cookie",
        "rights", "reserved", "copyright", "all", "some", "many", "few", "most",
        "very", "really", "quite", "rather", "pretty", "fairly", "somewhat"
    }
    
    for candidate in candidates:
        candidate_lower = candidate.lower()
        
        # Basic length and character checks
        if len(candidate) < 3 or len(candidate) > 50:
            continue
            
        # Must be alphabetic
        if not candidate.replace(" ", "").isalpha():
            continue
            
        # Skip stop phrases
        if candidate_lower in stop_phrases:
            continue
            
        # Skip single low-value words
        if len(candidate.split()) == 1 and candidate_lower in low_value_words:
            continue
            
        # Skip phrases that are too generic
        if len(candidate.split()) >= 2:
            words = candidate_lower.split()
            # Skip if all words are common articles/prepositions
            common_words = {"the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by"}
            if all(word in common_words for word in words):
                continue
                
        # Skip phrases with too many common words
        if len(candidate.split()) >= 3:
            words = candidate_lower.split()
            common_count = sum(1 for word in words if word in common_words)
            if common_count >= len(words) * 0.6:  # More than 60% common words
                continue
        
        filtered_candidates.append(candidate)
    
    return filtered_candidates

def calculate_semantic_quality(keyword: str) -> float:
    """Calculate semantic quality score for a keyword"""
    keyword_lower = keyword.lower()
    words = keyword_lower.split()
    
    # High-value semantic indicators
    high_value_indicators = {
        "best", "top", "guide", "review", "comparison", "vs", "how to", "what is",
        "benefits", "features", "advantages", "disadvantages", "pros", "cons",
        "tutorial", "tips", "tricks", "secrets", "methods", "techniques", "strategies",
        "cost", "price", "buy", "purchase", "order", "deal", "discount", "sale",
        "free", "premium", "professional", "expert", "advanced", "beginner", "starter"
    }
    
    # Low-value semantic indicators
    low_value_indicators = {
        "click", "here", "more", "read", "learn", "find", "get", "start", "begin",
        "page", "site", "website", "web", "online", "internet", "www", "http",
        "html", "css", "javascript", "php", "asp", "net", "com", "org", "edu"
    }
    
    # Calculate quality score
    quality_score = 1.0
    
    # Check for high-value indicators
    for word in words:
        if word in high_value_indicators:
            quality_score *= 1.2
        elif word in low_value_indicators:
            quality_score *= 0.9
    
    # Bonus for specific patterns
    if any(pattern in keyword_lower for pattern in ["how to", "what is", "best way", "top 10", "vs"]):
        quality_score *= 1.2
    
    # Penalty for too many common words
    common_words = {"the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by"}
    common_count = sum(1 for word in words if word in common_words)
    if common_count > len(words) * 0.5:  # More than 50% common words
        quality_score *= 0.8
    
    return max(0.1, min(2.0, quality_score))  # Clamp between 0.1 and 2.0

def validate_keyword_quality(keywords: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Validate and filter keywords for quality"""
    validated_keywords = []
    
    for kw in keywords:
        keyword = kw["text"]
        
        # Skip if score is too low
        if kw["score"] < 1.5:
            continue
            
        # Skip if frequency is too low
        if kw["freq"] < 2:
            continue
            
        # Skip if density is too high (over-optimization)
        if "density" in kw and kw["density"] > 5.0:
            continue
            
        # Skip overly generic keywords
        generic_patterns = [
            "click here", "read more", "learn more", "find out", "get started",
            "contact us", "about us", "home page", "main page", "site map",
            "privacy policy", "terms service", "cookie policy"
        ]
        
        if any(pattern in keyword.lower() for pattern in generic_patterns):
            continue
            
        # Skip single words that are too common
        if len(keyword.split()) == 1:
            common_single_words = {
                "page", "site", "website", "web", "online", "internet", "www",
                "click", "here", "more", "read", "learn", "find", "get", "start",
                "contact", "about", "home", "main", "map", "privacy", "terms"
            }
            if keyword.lower() in common_single_words:
                continue
        
        validated_keywords.append(kw)
    
    return validated_keywords

def score_keywords(candidates: List[str], text: str, title: str, h1_h2_text: str, url_tokens: str) -> List[Dict[str, Any]]:
    """Score keyword candidates with improved algorithm"""
    text_lower = text.lower()
    text_length = len(text_lower.split())
    
    # Calculate frequencies and basic stats
    frequencies = Counter()
    for candidate in candidates:
        count = text_lower.count(candidate)
        if count > 0:
            frequencies[candidate] = count
    
    # Calculate minimum frequency threshold (at least 1 occurrence or 0.05% of text)
    min_freq_threshold = max(1, int(text_length * 0.0005))
    
    scored_keywords = []
    for candidate, freq in frequencies.items():
        # Skip keywords with too low frequency
        if freq < min_freq_threshold:
            continue
            
        # Calculate keyword density
        keyword_density = (freq * len(candidate.split())) / text_length
        
        # Skip if density is too high (over-optimization)
        if keyword_density > 0.05:  # 5% max density
            continue
            
        # Calculate prominence boost
        boost = calculate_prominence_boost(candidate, title, h1_h2_text, " ".join(url_tokens))
        
        # Enhanced scoring algorithm
        word_count = len(candidate.split())
        
        # Base score: frequency with diminishing returns
        base_score = freq ** 0.8  # Diminishing returns for high frequency
        
        # Length bonus: favor 2-4 word phrases
        if word_count == 1:
            length_bonus = 0.5
        elif word_count == 2:
            length_bonus = 1.0
        elif word_count == 3:
            length_bonus = 1.2
        elif word_count == 4:
            length_bonus = 1.0
        else:
            length_bonus = 0.7
            
        # Density penalty: penalize over-optimization
        density_penalty = 1.0
        if keyword_density > 0.02:  # 2% threshold
            density_penalty = 1.0 - (keyword_density - 0.02) * 5
            
        # Semantic quality score
        semantic_score = calculate_semantic_quality(candidate)
        
        # Final score calculation
        final_score = (base_score * boost * length_bonus * density_penalty * semantic_score)
        
        # Only include keywords with meaningful scores
        if final_score >= 0.5:
            scored_keywords.append({
                "text": candidate,
                "score": round(final_score, 2),
                "freq": freq,
                "density": round(keyword_density * 100, 2),
                "boost": round(boost, 2),
                "semantic_score": round(semantic_score, 2)
            })
    
    # Sort by score
    scored_keywords.sort(key=lambda x: x["score"], reverse=True)
    
    return scored_keywords

def extract_keywords_from_html(html: str, url: str, final_url: str, lang_guess: str = "") -> Dict[str, Any]:
    """Main function to extract keywords from HTML"""
    # Extract content signals (with URL awareness)
    signals = extract_content_signals(html, final_url or url)
    
    # Extract readable text
    readable_text = extract_readable_text(html)
    
    # Preprocess
    processed_text, language = preprocess_text(readable_text, lang_guess)
    
    # Combine all text for analysis
    all_text = " ".join([
        signals["title"],
        signals["meta_desc"],
        signals["og_title"],
        signals["og_desc"],
        " ".join([h["text"] for h in signals["headings"]]),
        processed_text
    ])
    
    # Generate candidates
    candidates = generate_candidates(all_text)
    
    # Score keywords
    h1_h2_text = " ".join([h["text"] for h in signals["headings"] if h["level"] in ["h1", "h2"]])
    scored = score_keywords(candidates, all_text, signals["title"], h1_h2_text, signals["url_tokens"])
    
    # Validate keyword quality
    validated_keywords = validate_keyword_quality(scored)
    
    # Take top 30 (reduced from 50 for better quality)
    top_keywords = validated_keywords[:30]
    
    # Choose parent keyword
    parent = choose_parent_keyword(top_keywords, signals["title"], h1_h2_text, " ".join(signals["url_tokens"]))
    
    # Handle case where no parent keyword is found
    if not parent:
        # If no parent found, use the top keyword as fallback
        if top_keywords:
            parent = {
                "text": top_keywords[0]["text"],
                "score": top_keywords[0]["score"],
                "freq": top_keywords[0]["freq"]
            }
            other_keywords = top_keywords[1:]
        else:
            # No keywords at all - return empty result
            return {
                "url": final_url or url,
                "language": language,
                "parent": None,
                "children": [],
                "tree": TreeNode(url, 0).to_dict(),
                "keywords": [],
                "debug": {
                    "total_candidates": len(candidates),
                    "scored_keywords": len(scored),
                    "validated_keywords": len(validated_keywords),
                    "top_keywords_count": len(top_keywords),
                    "parent_selected": None,
                    "parent_score": None
                }
            }
    else:
        # Build hierarchy with URL as root, parent keyword as single child
        other_keywords = [kw for kw in top_keywords if kw["text"] != parent["text"]]
    
    # Create URL as root node
    url_root = TreeNode(url, 0)  # URL has no score
    
    # Create parent keyword as single child of URL
    parent_node = TreeNode(parent["text"], parent["score"])
    
    # Group other keywords into sub-parents based on similarity
    sub_parents = create_sub_parents(other_keywords, parent["text"])
    
    # Attach sub-parents as children of the main parent
    for sub_parent in sub_parents:
        parent_node.children.append(sub_parent)
    
    # Attach parent as single child of URL root
    url_root.children.append(parent_node)
    
    tree_root = url_root
    
    # Create children list with similarity scores (sub-parents only)
    children = []
    if parent:
        parent_tokens = set(tokenize_phrase(parent["text"]))
        for sub_parent in sub_parents:
            child_tokens = set(tokenize_phrase(sub_parent.text))
            similarity = jaccard_similarity(parent_tokens, child_tokens)
            
            # Include sub-parents as children of the main parent
            children.append({
                "text": sub_parent.text,
                "score": sub_parent.score,
                "freq": 0,  # Sub-parents don't have frequency
                "intent": infer_intent(sub_parent.text),
                "similarity": round(similarity, 3)
            })
    
    # Create final keywords list
    keywords = []
    for kw in top_keywords:
        keywords.append({
            "text": kw["text"],
            "score": kw["score"],
            "freq": kw["freq"],
            "intent": infer_intent(kw["text"])
        })
    
    # Add debug information for troubleshooting
    debug_info = {
        "total_candidates": len(candidates),
        "scored_keywords": len(scored),
        "validated_keywords": len(validated_keywords),
        "top_keywords_count": len(top_keywords),
        "parent_selected": parent["text"] if parent else None,
        "parent_score": parent["score"] if parent else None
    }
    
    return {
        "url": final_url or url,
        "language": language,
        "parent": {
            "text": parent["text"],
            "score": parent["score"],
            "freq": parent["freq"],
            "intent": infer_intent(parent["text"])
        } if parent else None,
        "children": children,
        "tree": tree_root.to_dict(),
        "keywords": keywords,
        "debug": debug_info
    }
