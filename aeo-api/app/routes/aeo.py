from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import requests
import logging
from ..services.aeo_services_consolidated import AEOServiceOrchestrator

router = APIRouter(prefix="/api/aeo", tags=["AEOCHECKER"])

class AnalyzeRequest(BaseModel):
    url: str
    competitor_urls: Optional[List[str]] = []

class AnalyzeResponse(BaseModel):
    success: bool
    results: dict
    error: Optional[str] = None

# Initialize service orchestrator
aeo_orchestrator = AEOServiceOrchestrator()

@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_aeo(request: AnalyzeRequest):
    """
    AEOCHECKER analysis endpoint
    Analyzes AI presence, competitor landscape, knowledge base, answerability, and crawler accessibility
    """
    try:
        # Add protocol if missing
        url = request.url
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        
        # Get HTML content for analysis
        try:
            html_response = requests.get(url, timeout=10)
            html_content = html_response.text
        except Exception as e:
            raise HTTPException(status_code=400, detail=f'Failed to fetch URL: {str(e)}')
        
        # Run complete analysis using orchestrator
        logging.info("Running complete AEOCHECKER analysis...")
        results = aeo_orchestrator.run_complete_analysis(
            url=url,
            html_content=html_content,
            competitor_urls=request.competitor_urls
        )
        
        if 'error' in results:
            raise HTTPException(status_code=400, detail=results['error'])
        
        return AnalyzeResponse(success=True, results=results)
        
    except Exception as e:
        return AnalyzeResponse(success=False, results={}, error=str(e))

@router.get("/health")
async def health_check():
    """AEOCHECKER health check"""
    return {
        "status": "healthy",
        "service": "AEOCHECKER - AI Search Engine Optimization Analyzer",
        "version": "1.0.0"
    }
