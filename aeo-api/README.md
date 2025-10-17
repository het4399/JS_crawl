# SEO Keyword Extractor - Python API

FastAPI service for extracting SEO keywords from HTML content with hierarchical structure.

## Features

- Extract keywords from HTML content using BeautifulSoup and readability
- NLP processing with spaCy for tokenization and lemmatization
- Parent keyword selection with hierarchical tree structure
- Intent classification (informational, transactional, navigational)
- Language detection and processing

## Quick Start

### Using Docker (Recommended)

```bash
# Build and run with Docker Compose
docker-compose up --build

# Or build and run manually
docker build -t seo-keywords-api .
docker run -p 8000:8000 seo-keywords-api
```

### Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Download spaCy model
python -m spacy download en_core_web_sm

# Run the server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## API Endpoints

### POST /extract_html

Extract keywords from HTML content.

**Request Body:**
```json
{
  "url": "https://example.com",
  "final_url": "https://example.com",
  "status_code": 200,
  "headers": {},
  "html": "<html>...</html>",
  "fetched_at": "2024-01-01T00:00:00Z",
  "lang_guess": "en"
}
```

**Response:**
```json
{
  "url": "https://example.com",
  "language": "en",
  "parent": {
    "text": "best running shoes",
    "score": 42.3,
    "freq": 5,
    "intent": "transactional"
  },
  "children": [
    {
      "text": "running shoes for men",
      "score": 18.0,
      "freq": 3,
      "intent": "transactional",
      "similarity": 0.67
    }
  ],
  "tree": {
    "text": "best running shoes",
    "score": 42.3,
    "children": [...]
  },
  "keywords": [...]
}
```

### GET /health

Health check endpoint.

## Environment Variables

- `PORT`: Server port (default: 8000)
- `SPACY_MODEL`: spaCy model to use (default: en_core_web_sm)
- `MAX_HTML_SIZE_MB`: Maximum HTML size in MB (default: 2)

## Development

The service uses:
- FastAPI for the web framework
- BeautifulSoup for HTML parsing
- readability-lxml for content extraction
- spaCy for NLP processing
- langdetect for language detection
