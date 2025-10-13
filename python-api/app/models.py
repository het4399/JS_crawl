from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class ExtractHtmlRequest(BaseModel):
    url: str
    final_url: str
    status_code: int
    headers: Dict[str, Any] = {}
    html: str
    fetched_at: str
    lang_guess: str = ""

class Keyword(BaseModel):
    text: str
    score: float
    freq: int = 0
    intent: str = "informational"
    similarity: Optional[float] = None

class TreeNode(BaseModel):
    text: str
    score: float
    children: List['TreeNode'] = []

class ExtractResponse(BaseModel):
    url: str
    language: str
    parent: Optional[Keyword] = None
    children: List[Keyword] = []
    tree: Optional[TreeNode] = None
    keywords: List[Keyword] = []
    debug: Optional[Dict[str, Any]] = None
