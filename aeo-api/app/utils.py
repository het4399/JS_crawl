import spacy
from typing import List, Set, Dict, Any
from collections import Counter
import re

# Load spaCy model (will be initialized in main.py)
nlp = None

# ------------------------
# Keyword rule dictionaries
# ------------------------
TEMPORAL_MONTHS: Set[str] = {
    "january","february","march","april","may","june","july","august","september","october","november","december",
    "jan","feb","mar","apr","jun","jul","aug","sep","sept","oct","nov","dec"
}
TEMPORAL_DAYS: Set[str] = {
    "monday","tuesday","wednesday","thursday","friday","saturday","sunday",
    "mon","tue","wed","thu","fri","sat","sun"
}

# Common site sections / boilerplate across the web
SECTION_TERMS: Set[str] = {
    "home","homepage","blog","news","press","release","press-release","events","all-events","careers","career",
    "jobs","about","about-us","team","contact","contact-us","support","help","faq","esg","csr","investors",
    "privacy","policy","terms","conditions","terms-and-conditions","cookies","cookie","sitemap","login","signup",
    "account","profile","settings","newsletter","subscribe","archives","category","tag","author","search","404"
}

# Generic base tokens that should not constitute parents by themselves
GENERIC_BASE_TERMS: Set[str] = {
    "real","estate","service","services","solution","solutions","platform","app","apps","software","tool","tools",
    "news","article","blog","post","posts","update","latest","info","information","guide","report","press",
    "release","case","study","case-study","india","global","international","industry","company","companies",
    "product","products","feature","features","page","pages","download","center","team","career","policy","term",
    "terms","condition","conditions","overview","summary","faq","qna","q&a","help","support"
}

# Domain topical hints (energy/solar specific) – used only as a soft boost
ENERGY_TOPICAL_TOKENS: Set[str] = {
    "solar","panel","panels","inverter","renewable","energy","efficiency","battery","storage","rooftop",
    "pv","photovoltaic","subsidies","subsidy","decarbonization","surya","yojana","grid","offgrid","on-grid","net-metering"
}

def init_nlp():
    global nlp
    if nlp is None:
        try:
            nlp = spacy.load("en_core_web_sm", disable=["ner"])
        except OSError:
            print("⚠️  spaCy English model not found. Installing...")
            import subprocess
            import sys
            try:
                # Try direct pip install from GitHub
                subprocess.run([
                    sys.executable, "-m", "pip", "install", 
                    "https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.7.1/en_core_web_sm-3.7.1-py3-none-any.whl"
                ], check=True)
                nlp = spacy.load("en_core_web_sm", disable=["ner"])
                print("✅ spaCy model installed successfully")
            except Exception as e:
                print(f"❌ Failed to install spaCy model: {e}")
                print("Please run manually:")
                print("pip install https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.7.1/en_core_web_sm-3.7.1-py3-none-any.whl")
                raise

def tokenize_phrase(phrase: str) -> List[str]:
    """Extract lemmatized tokens from a phrase"""
    if nlp is None:
        init_nlp()
    doc = nlp(phrase)
    return [t.lemma_.lower() for t in doc if t.is_alpha and not t.is_stop and len(t) > 1]

def jaccard_similarity(a: Set[str], b: Set[str]) -> float:
    """Calculate Jaccard similarity between two sets"""
    if not a or not b:
        return 0.0
    intersection = len(a & b)
    union = len(a | b)
    return intersection / union if union else 0.0

def in_text(needle: str, haystack: str) -> bool:
    """Check if needle is contained in haystack (case insensitive)"""
    return needle.lower() in haystack.lower()

def is_temporal_token(token: str) -> bool:
    return token in TEMPORAL_MONTHS or token in TEMPORAL_DAYS

def is_section_token(token: str) -> bool:
    return token in SECTION_TERMS

def is_generic_base(token: str) -> bool:
    return token in GENERIC_BASE_TERMS

def has_energy_topical(tokens: Set[str]) -> bool:
    return bool(tokens & ENERGY_TOPICAL_TOKENS)

def calculate_prominence_boost(keyword: str, title: str, h1_h2_text: str, url_tokens: str) -> float:
    """Calculate prominence boost for a keyword based on its position"""
    boost = 1.0
    kw_lower = keyword.lower()
    
    if in_text(kw_lower, title):
        boost *= 3.0
    if in_text(kw_lower, h1_h2_text):
        boost *= 1.8
    if in_text(kw_lower, url_tokens):
        boost *= 1.5
    
    return boost

def infer_intent(keyword: str) -> str:
    """Infer search intent from keyword text"""
    kw_lower = keyword.lower()
    
    transactional_words = ["buy", "price", "deal", "coupon", "order", "best", "cheap", "shop", "store"]
    informational_words = ["how", "what", "guide", "tutorial", "vs", "review", "learn", "tips", "why", "when"]
    navigational_words = ["login", "signup", "brand", "home", "contact", "about"]
    
    if any(word in kw_lower for word in transactional_words):
        return "transactional"
    if any(word in kw_lower for word in informational_words):
        return "informational"
    if any(word in kw_lower for word in navigational_words):
        return "navigational"
    
    return "informational"

def choose_parent_keyword(scored_keywords: List[Dict[str, Any]], title: str, h1_h2_text: str, url_tokens: str) -> Dict[str, Any]:
    """Select the best parent keyword from scored candidates with improved algorithm

    Changes:
    - Enforce multi-word parent (2–4 tokens). Single-word parents are disallowed.
    - Demote/skip boilerplate page terms (privacy, terms, faq, about, contact, newsletter, policy).
    - Title/H1 seeding: prefer candidates that occur in title/H1; fall back to all.
    """
    if not scored_keywords:
        return None

    boilerplate_terms = SECTION_TERMS

    # Very generic base tokens that should not stand alone as a parent
    generic_base_terms = {
        "real", "estate", "service", "services", "news", "letter", "update",
        "latest", "info", "information", "policy", "term", "terms", "support"
    }

    def is_boilerplate_phrase(text: str) -> bool:
        tokens = set(tokenize_phrase(text))
        return bool(tokens & boilerplate_terms)

    # First, build an eligible pool: multi-word only and not boilerplate-only
    eligible: List[Dict[str, Any]] = []
    for item in scored_keywords:
        kw = item["text"]
        tokens = tokenize_phrase(kw)
        if len(tokens) < 2:  # require multi-word
            continue
        # If phrase is dominated by boilerplate terms, skip it
        if is_boilerplate_phrase(kw) and len([t for t in tokens if t not in boilerplate_terms]) == 0:
            continue
        # Require at least one non-generic modifier token
        if not any(not is_generic_base(t) for t in tokens):
            continue
        eligible.append(item)

    if not eligible:
        return None

    def parent_rank(item: Dict[str, Any]) -> float:
        keyword = item["text"]
        tokens = tokenize_phrase(keyword)
        word_count = len(tokens)

        # Length scoring - enforce 2–4 word sweet spot
        if word_count == 2:
            length_score = 1.0
        elif word_count == 3:
            length_score = 1.2
        elif word_count == 4:
            length_score = 1.0
        else:
            length_score = 0.7

        title_hit = 2.2 if in_text(keyword, title) else 0.0
        h1_hit = 1.6 if in_text(keyword, h1_h2_text) else 0.0
        url_hit = 1.0 if in_text(keyword, url_tokens) else 0.0

        semantic_quality = calculate_semantic_quality_for_parent(keyword)

        freq_score = min(item.get("freq", 0), 10) / 10.0
        density_score = 1.0
        if item.get("density", 0) > 3.0:
            density_score = 0.7

        intent = infer_intent(keyword)
        intent_score = 1.2 if intent in ("transactional", "informational") else 0.9

        # Boilerplate penalty if any boilerplate or temporal token appears; slight boost if clearly topical
        has_temporal = any(is_temporal_token(t) for t in tokens)
        boilerplate_penalty = 0.8 if (is_boilerplate_phrase(keyword) or has_temporal) else 1.0
        topical_boost = 1.1 if has_energy_topical(set(tokens)) else 1.0
        # Stronger penalty if URL path itself suggests boilerplate context
        url_boilerplate_penalty = 0.8 if any(bt in url_tokens for bt in boilerplate_terms) else 1.0

        final_score = (
            0.25 * item["score"] +
            0.20 * title_hit +
            0.15 * h1_hit +
            0.10 * url_hit +
            0.10 * length_score +
            0.10 * semantic_quality +
            0.05 * freq_score +
            0.03 * density_score +
            0.02 * intent_score
        ) * boilerplate_penalty * url_boilerplate_penalty * topical_boost

        return final_score

    # Title/H1 seeding: prefer those present in title or H1/H2
    seeded = [it for it in eligible if in_text(it["text"], title) or in_text(it["text"], h1_h2_text)]
    pool = seeded if seeded else eligible

    # As a last guard, ensure we never return a single-word parent
    best = max(pool, key=parent_rank)
    if len(tokenize_phrase(best["text"])) < 2:
        # find next best with >= 2 tokens
        multi = [it for it in pool if len(tokenize_phrase(it["text"])) >= 2]
        if multi:
            return max(multi, key=parent_rank)
        return None
    return best

def calculate_semantic_quality_for_parent(keyword: str) -> float:
    """Calculate semantic quality specifically for parent keyword selection"""
    keyword_lower = keyword.lower()
    words = keyword_lower.split()
    
    # High-value parent keyword indicators
    parent_indicators = {
        "best", "top", "guide", "review", "comparison", "vs", "how to", "what is",
        "benefits", "features", "advantages", "tutorial", "tips", "methods",
        "cost", "price", "buy", "purchase", "deal", "discount", "sale",
        "free", "premium", "professional", "expert", "advanced", "beginner"
    }
    
    # Calculate quality score
    quality_score = 1.0
    
    # Check for parent indicators
    for word in words:
        if word in parent_indicators:
            quality_score *= 1.4
    
    # Bonus for question patterns (high search intent)
    if any(pattern in keyword_lower for pattern in ["how to", "what is", "why", "when", "where", "which"]):
        quality_score *= 1.3
    
    # Bonus for comparison patterns
    if any(pattern in keyword_lower for pattern in ["vs", "versus", "comparison", "compare", "best"]):
        quality_score *= 1.2
    
    # Penalty for too many common words
    common_words = {"the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by"}
    common_count = sum(1 for word in words if word in common_words)
    if common_count > len(words) * 0.4:  # More than 40% common words
        quality_score *= 0.8
    
    return max(0.5, min(2.0, quality_score))  # Clamp between 0.5 and 2.0

def should_be_child(parent_tokens: Set[str], child_tokens: Set[str]) -> bool:
    """Determine if child should be attached to parent based on token overlap"""
    # Strong signal: parent tokens are subset of child (child = parent + modifiers)
    if parent_tokens and parent_tokens.issubset(child_tokens):
        return True
    # Check for any token overlap (more lenient)
    if parent_tokens and child_tokens and (parent_tokens & child_tokens):
        return True
    # Fallback: sufficiently similar
    return jaccard_similarity(parent_tokens, child_tokens) >= 0.3

def attach_to_best_parent(root: 'TreeNode', candidate: 'TreeNode') -> bool:
    """Attach candidate to the most specific parent in the tree"""
    # DFS to find the most specific parent
    stack = [(root, 1)]
    best_parent = None
    best_depth = 0
    
    while stack:
        node, depth = stack.pop()
        
        if should_be_child(node.tokens, candidate.tokens):
            if depth >= best_depth:
                best_parent = node
                best_depth = depth
        
        for child in node.children:
            stack.append((child, depth + 1))
    
    if best_parent:
        best_parent.children.append(candidate)
        return True
    return False

class TreeNode:
    """Node for building keyword hierarchy tree"""
    def __init__(self, text: str, score: float):
        self.text = text
        self.score = score
        self.tokens = set(tokenize_phrase(text))
        self.children: List['TreeNode'] = []
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            "text": self.text,
            "score": self.score,
            "children": [child.to_dict() for child in self.children]
        }

def build_hierarchy(parent_data: Dict[str, Any], other_keywords: List[Dict[str, Any]]) -> TreeNode:
    """Build hierarchical tree from parent and other keywords"""
    root = TreeNode(parent_data["text"], parent_data["score"])
    
    # Sort by specificity: longer phrases first, then by score
    def specificity_key(item: Dict[str, Any]) -> tuple:
        return (len(tokenize_phrase(item["text"])), item["score"])
    
    for item in sorted(other_keywords, key=specificity_key, reverse=True):
        node = TreeNode(item["text"], item["score"])
        attached = attach_to_best_parent(root, node)
        
        if not attached:
            # Attach ALL remaining keywords as direct children of root
            # This ensures every keyword appears in the hierarchy
            root.children.append(node)
    
    return root
