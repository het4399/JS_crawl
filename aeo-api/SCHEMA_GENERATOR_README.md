# 📝 Schema.org Markup Generator

## Overview

The Schema.org Markup Generator is an AI-powered tool that automatically generates SEO-optimized Schema.org JSON-LD markup for any web page. It uses OpenAI's GPT-4o-mini to analyze page content and create the most appropriate schema types with all relevant properties.

## Features

- ✨ **AI-Powered Generation**: Uses OpenAI GPT-4o-mini to intelligently analyze content
- 🎯 **Smart Type Detection**: Automatically determines the best schema type (Article, Product, LocalBusiness, etc.)
- 📋 **One-Click Copy**: Easy clipboard copy functionality
- 🔄 **Fallback Support**: Generates basic schema when AI is unavailable
- ✅ **Valid JSON-LD**: Produces valid Schema.org markup ready to use
- 🎨 **Beautiful UI**: Modern, intuitive interface with implementation instructions

## Architecture

### Backend Components

#### 1. Schema Generator Service (`app/services/schema_generator.py`)

Main service class that handles schema generation:

```python
class SchemaGenerator:
    def __init__(self):
        # Initializes OpenAI client with API key
        
    def extract_page_content(self, html: str, url: str) -> Dict[str, Any]:
        # Extracts relevant content from HTML
        
    def generate_schema_with_ai(self, page_content: Dict[str, Any]) -> Dict[str, Any]:
        # Uses OpenAI to generate schema markup
        
    def generate_fallback_schema(self, page_content: Dict[str, Any]) -> Dict[str, Any]:
        # Generates basic schema without AI
        
    def generate_schema(self, html: str, url: str) -> Dict[str, Any]:
        # Main method - orchestrates the generation process
```

**Key Features:**
- Extracts page metadata (title, description, headings, images)
- Detects content indicators (article, business, product)
- Generates AI-powered schema with GPT-4o-mini
- Falls back to basic schema if AI unavailable
- Returns structured response with schema JSON and metadata

#### 2. API Route (`app/routes/aeo.py`)

FastAPI endpoint for schema generation:

```python
@router.post("/generate-schema")
async def generate_schema(request: SchemaGenerateRequest):
    # Endpoint: POST /api/aeo/generate-schema
    # Body: { "url": "https://example.com", "html_content": "..." }
```

### Frontend Components

#### 1. AEO Dashboard Component (`src/frontend/components/aeo/AEODashboard.tsx`)

**New State Variables:**
```typescript
const [schemaData, setSchemaData] = useState<any>(null);
const [schemaLoading, setSchemaLoading] = useState(false);
const [schemaError, setSchemaError] = useState<string | null>(null);
const [copiedSchema, setCopiedSchema] = useState(false);
```

**Key Functions:**
```typescript
// Generate schema markup
const generateSchema = async () => { ... }

// Copy to clipboard
const copySchemaToClipboard = () => { ... }
```

#### 2. Schema Generator Tab

New tab added to the dashboard with:
- **Generate Button**: Triggers AI-powered schema generation
- **Schema Info Card**: Displays schema types and metadata
- **Code Display**: Shows formatted JSON-LD markup
- **Copy Button**: One-click clipboard copy
- **Implementation Guide**: Step-by-step instructions
- **Benefits Section**: Explains advantages of schema markup

#### 3. Styling (`src/frontend/components/aeo/AEODashboard.css`)

Added comprehensive styles:
- `.schema-generator-content` - Main container
- `.schema-code-card` - Code display with syntax highlighting
- `.schema-info-card` - Metadata display
- `.schema-benefits-card` - Benefits grid
- `.copy-button` - Styled copy button with hover effects

## Usage

### Backend API

#### Generate Schema

```bash
POST http://localhost:8000/api/aeo/generate-schema
Content-Type: application/json

{
  "url": "https://example.com",
  "html_content": "<html>...</html>"  // Optional
}
```

**Response:**
```json
{
  "success": true,
  "results": {
    "schema": {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": "Example Article",
      "description": "...",
      "image": ["..."],
      "author": { "@type": "Person", "name": "..." }
    },
    "schema_text": "{\n  \"@context\": \"https://schema.org\",\n  ...\n}",
    "schema_types": ["Article"],
    "model_used": "gpt-4o-mini",
    "tokens_used": 450
  }
}
```

### Frontend Usage

1. **Navigate to Schema Generator Tab**
   - Click the "📝 Schema Generator" tab in the AEO Dashboard

2. **Generate Schema**
   - Click "✨ Generate Schema" button
   - Wait for AI analysis (usually 2-5 seconds)

3. **Review Generated Schema**
   - View schema type(s) detected
   - Check AI model and token usage
   - Review the JSON-LD markup

4. **Copy to Clipboard**
   - Click "📋 Copy to Clipboard" button
   - Paste into your website's `<head>` section

5. **Implement**
   - Follow the step-by-step implementation guide
   - Test with Google's Rich Results Test
   - Validate with Schema.org Validator

## Configuration

### Environment Variables

Required in `.env` file:

```bash
# OpenAI API Key (required for AI-powered generation)
OPENAI_API_KEY=sk-your-openai-api-key-here
```

**Note:** If `OPENAI_API_KEY` is not set, the system will fall back to basic schema generation.

### API Model

Currently using `gpt-4o-mini` for cost efficiency. Can be changed in `schema_generator.py`:

```python
response = self.client.chat.completions.create(
    model="gpt-4o-mini",  # Change to gpt-4 for better quality
    ...
)
```

## Schema Types Supported

The AI can generate any Schema.org type, including:

### Common Types
- **Article** - Blog posts, news articles
- **BlogPosting** - Blog-specific articles
- **WebPage** - General web pages
- **Organization** - Company/organization pages
- **LocalBusiness** - Local business pages
- **Product** - Product pages
- **Person** - Personal/bio pages
- **Event** - Event pages
- **Recipe** - Recipe pages
- **FAQPage** - FAQ pages

### Business Types
- **Restaurant**
- **Store**
- **ProfessionalService**
- **HealthAndBeautyBusiness**
- And many more...

## Implementation Example

### Generated Schema
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "10 Best SEO Practices for 2024",
  "description": "Learn the top SEO strategies...",
  "image": [
    "https://example.com/images/seo-guide.jpg"
  ],
  "author": {
    "@type": "Person",
    "name": "John Doe"
  },
  "publisher": {
    "@type": "Organization",
    "name": "SEO Experts",
    "logo": {
      "@type": "ImageObject",
      "url": "https://example.com/logo.png"
    }
  },
  "datePublished": "2024-01-15",
  "dateModified": "2024-01-20"
}
```

### HTML Implementation
```html
<!DOCTYPE html>
<html>
<head>
  <title>10 Best SEO Practices for 2024</title>
  
  <!-- Schema.org Markup -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "10 Best SEO Practices for 2024",
    ...
  }
  </script>
</head>
<body>
  <!-- Your content here -->
</body>
</html>
```

## Testing & Validation

### Google Rich Results Test
1. Go to: https://search.google.com/test/rich-results
2. Paste your URL or code
3. Click "Test URL" or "Test Code"
4. Review results and fix any errors

### Schema.org Validator
1. Go to: https://validator.schema.org/
2. Paste your schema markup
3. Click "Validate"
4. Check for warnings and errors

### Google Search Console
After implementing:
1. Submit your URL to Google Search Console
2. Wait for indexing (can take days/weeks)
3. Check "Enhancements" section for rich results

## Benefits

### SEO Benefits
- ✅ Better search engine understanding
- ✅ Enhanced search result appearance
- ✅ Higher click-through rates (CTR)
- ✅ Rich snippets eligibility
- ✅ Knowledge Graph inclusion potential

### AI & Voice Search
- ✅ Optimized for AI chatbots (ChatGPT, Claude, Gemini)
- ✅ Better voice search results
- ✅ Featured in AI-generated answers
- ✅ Improved content understanding

### Technical Benefits
- ✅ Structured, machine-readable data
- ✅ Standards-compliant markup
- ✅ Future-proof implementation
- ✅ Easy maintenance and updates

## Troubleshooting

### Issue: "OpenAI API not configured"

**Solution:**
1. Add `OPENAI_API_KEY` to your `.env` file
2. Restart the backend server
3. The system will use AI-powered generation

**Fallback:** Basic schema will be generated without AI

### Issue: "Failed to fetch URL"

**Causes:**
- URL is not accessible
- Server is down
- Timeout (>10 seconds)

**Solution:**
- Check URL is correct and accessible
- Try providing `html_content` directly in the request

### Issue: "Invalid JSON generated"

**Rare case** where AI generates invalid JSON

**Solution:**
- The system will automatically fall back to basic schema
- Check logs for details
- Consider using gpt-4 instead of gpt-4o-mini

### Issue: Schema not showing in search results

**Timeline:** Can take 2-4 weeks for Google to process

**Checklist:**
1. ✅ Schema is valid (use validators)
2. ✅ Schema is in `<head>` section
3. ✅ Page is indexed by Google
4. ✅ Content matches schema markup
5. ✅ No conflicting markup on page

## API Costs

Using OpenAI GPT-4o-mini:
- **Average tokens per request**: 400-600 tokens
- **Cost per request**: ~$0.0001 - $0.0002 (very low)
- **Monthly estimate** (1000 requests): ~$0.10 - $0.20

**Note:** Costs are approximate and based on current OpenAI pricing.

## Best Practices

### 1. Content Accuracy
- Ensure schema matches actual page content
- Don't add information not present on the page
- Update schema when content changes

### 2. Schema Selection
- Use the most specific type available
- Consider using multiple types when appropriate
- Follow Google's guidelines for rich results

### 3. Required Properties
- Always include required properties for your schema type
- Add recommended properties when possible
- Use valid URLs for images and links

### 4. Testing
- Test before deploying to production
- Validate with multiple tools
- Monitor Search Console for errors

### 5. Maintenance
- Review schema quarterly
- Update when content changes significantly
- Keep up with Schema.org updates

## Future Enhancements

Planned features:
- [ ] Multiple schema types per page
- [ ] Schema editing interface
- [ ] Schema validation in UI
- [ ] Schema history/versioning
- [ ] Bulk schema generation
- [ ] Custom schema templates
- [ ] Schema comparison tool

## Resources

### Official Documentation
- [Schema.org](https://schema.org/) - Official schema documentation
- [Google Search Central](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) - Google's structured data guide
- [OpenAI API](https://platform.openai.com/docs) - OpenAI API documentation

### Testing Tools
- [Google Rich Results Test](https://search.google.com/test/rich-results)
- [Schema.org Validator](https://validator.schema.org/)
- [Google Search Console](https://search.google.com/search-console)

### Learning Resources
- [Schema.org Getting Started](https://schema.org/docs/gs.html)
- [Google Structured Data Guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [JSON-LD Playground](https://json-ld.org/playground/)

## Support

For issues or questions:
1. Check this documentation
2. Review error messages in console
3. Test with validation tools
4. Check OpenAI API status
5. Review backend logs

## License

Part of the AEO Checker suite - SEO Analysis & Optimization Platform

---

**Last Updated:** November 2024  
**Version:** 1.0.0  
**Status:** Production Ready ✅

