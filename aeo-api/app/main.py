from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
import uvicorn
import os
import asyncio
from concurrent.futures import ProcessPoolExecutor

from .models import ExtractHtmlRequest, ExtractResponse
from .extract import extract_keywords_from_html
from .utils import init_nlp
from .routes import aeo

# Initialize spaCy model
init_nlp()

# -----------------
# Concurrency setup
# -----------------
_WORKERS = min(32, (os.cpu_count() or 4))
_EXECUTOR = ProcessPoolExecutor(max_workers=_WORKERS)
_SEMAPHORE = asyncio.Semaphore(_WORKERS * 2)

def _extract_task(html: str, url: str, final_url: str, lang_guess: str):
    """Synchronous wrapper executed in a worker process."""
    return extract_keywords_from_html(
        html=html,
        url=url,
        final_url=final_url,
        lang_guess=lang_guess,
    )

app = FastAPI(
    title="SEO Analysis API",
    description="SEO keyword extraction and AEOCHECKER analysis",
    version="1.0.0"
)

# Include AEOCHECKER routes
app.include_router(aeo.router)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "SEO Keyword Extractor API", "status": "running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "keyword-extractor"}

@app.post("/extract_html", response_model=ExtractResponse)
async def extract_html(request: ExtractHtmlRequest):
    """
    Extract keywords from HTML content with hierarchical structure
    """
    try:
        # Validate HTML content
        if not request.html or len(request.html.strip()) == 0:
            raise HTTPException(status_code=400, detail="HTML content is empty")
        
        # Limit HTML size (configurable; default 5MB)
        try:
            max_html_mb = float(os.getenv("MAX_HTML_MB", "5"))
        except ValueError:
            max_html_mb = 5.0
        max_bytes = int(max_html_mb * 1024 * 1024)
        if len(request.html) > max_bytes:
            raise HTTPException(status_code=400, detail=f"HTML content too large (max {int(max_html_mb)}MB)")
        
        # Extract keywords (CPU-bound) in process pool, bounded by semaphore
        async with _SEMAPHORE:
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(
                _EXECUTOR,
                _extract_task,
                request.html,
                request.url,
                request.final_url,
                request.lang_guess,
            )
        
        return ExtractResponse(**result)
        
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=f"Validation error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
