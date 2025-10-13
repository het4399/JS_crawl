from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
import uvicorn

from .models import ExtractHtmlRequest, ExtractResponse
from .extract import extract_keywords_from_html
from .utils import init_nlp

# Initialize spaCy model
init_nlp()

app = FastAPI(
    title="SEO Keyword Extractor API",
    description="Extract SEO keywords from HTML with hierarchical structure",
    version="1.0.0"
)

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
        
        # Limit HTML size (2MB)
        if len(request.html) > 2 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="HTML content too large (max 2MB)")
        
        # Extract keywords
        result = extract_keywords_from_html(
            html=request.html,
            url=request.url,
            final_url=request.final_url,
            lang_guess=request.lang_guess
        )
        
        return ExtractResponse(**result)
        
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=f"Validation error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
