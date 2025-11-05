from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import requests
import logging
from ..services.aeo_services_consolidated import AEOServiceOrchestrator
from ..services.schema_generator import SchemaGenerator

router = APIRouter(prefix="/api/aeo", tags=["AEOCHECKER"])

class AnalyzeRequest(BaseModel):
    url: str
    competitor_urls: Optional[List[str]] = []

class AnalyzeResponse(BaseModel):
    success: bool
    results: dict
    error: Optional[str] = None

class StructuredDataRequest(BaseModel):
    url: str
    html_content: Optional[str] = None

class SchemaGenerateRequest(BaseModel):
    url: str
    html_content: Optional[str] = None

# Initialize service orchestrator
aeo_orchestrator = AEOServiceOrchestrator()
schema_generator = SchemaGenerator()

@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_aeo(request: AnalyzeRequest):
    """
    AEOCHECKER analysis endpoint
    Analyzes AI presence, competitor landscape, knowledge base, answerability, 
    crawler accessibility, and structured data
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

@router.post("/analyze-structured-data", response_model=AnalyzeResponse)
async def analyze_structured_data(request: StructuredDataRequest):
    """
    Analyze structured data (JSON-LD, Microdata, RDFa) for a given URL
    """
    try:
        # Add protocol if missing
        url = request.url
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        
        # Run structured data analysis
        logging.info(f"Running structured data analysis for {url}")
        results = aeo_orchestrator.analyze_structured_data(
            url=url,
            html_content=request.html_content
        )
        
        if 'error' in results:
            raise HTTPException(status_code=400, detail=results['error'])
        
        return AnalyzeResponse(success=True, results=results)
        
    except Exception as e:
        return AnalyzeResponse(success=False, results={}, error=str(e))

@router.post("/generate-schema", response_model=AnalyzeResponse)
async def generate_schema(request: SchemaGenerateRequest):
    """
    Generate Schema.org markup for a given URL using AI
    """
    try:
        # Add protocol if missing
        url = request.url
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        
        # Get HTML content if not provided
        html_content = request.html_content
        if not html_content:
            try:
                html_response = requests.get(url, timeout=10)
                html_content = html_response.text
            except Exception as e:
                raise HTTPException(status_code=400, detail=f'Failed to fetch URL: {str(e)}')
        
        # Generate schema markup
        logging.info(f"Generating schema markup for {url}")
        results = schema_generator.generate_schema(html_content, url)
        
        if not results.get('success', False):
            raise HTTPException(status_code=400, detail=results.get('message', 'Schema generation failed'))
        
        return AnalyzeResponse(success=True, results=results)
        
    except Exception as e:
        return AnalyzeResponse(success=False, results={}, error=str(e))

@router.get("/health")
async def health_check():
    """AEOCHECKER health check"""
    return {
        "status": "healthy",
        "service": "AEOCHECKER - AI Search Engine Optimization Analyzer",
        "version": "1.0.0",
        "features": [
            "AI Presence Analysis",
            "Structured Data Analysis",
            "Competitor Analysis",
            "Knowledge Base Analysis",
            "Answerability Analysis",
            "Crawler Accessibility Analysis",
            "Schema.org Markup Generator"
        ]
    }
