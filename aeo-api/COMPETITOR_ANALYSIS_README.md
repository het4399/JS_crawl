# DataForSEO Competitor Analysis Integration

## Overview

The competitor analysis service has been upgraded to use the **DataForSEO API** for comprehensive backlink analysis. This provides real-time, accurate data about your domain's backlink profile and competitive landscape.

## What Changed

### Previous Implementation
- Basic web scraping of competitor URLs
- Limited to schema markup and text content analysis
- No real backlink data
- Required manual competitor URL input

### New Implementation
- **DataForSEO API integration** for professional-grade backlink analysis
- Analyzes referring domains, backlink quality, and spam scores
- Automatic data selection (uses all data if ≤100 domains, top 100 if more)
- Calculates comprehensive Competitor Landscape Score (0-100)
- Provides actionable recommendations

## Features

### 1. Backlink Analysis
- **Referring Domains**: Total unique domains linking to your site
- **Individual Backlinks**: Total number of backlinks across all domains
- **Dofollow/Nofollow Ratio**: Quality indicator for link equity

### 2. Quality Metrics
- **Domain Quality Score**: Based on domain authority/rank
- **Spam Score**: Identifies potentially toxic backlinks
- **Diversity Score**: Measures variety across TLDs, countries, and platforms

### 3. Competitive Intelligence
- **Top Competitors**: Identifies domains with most referring links
- **Benchmark Scoring**: 0-100 score based on weighted formula
- **Smart Recommendations**: Actionable advice based on your profile

## Scoring Formula

```
Competitor Landscape Score = 
  30% × Referring Domains (normalized)
+ 30% × Dofollow Backlinks (normalized)
+ 20% × Domain Quality (0-100)
+ 20% × Diversity Score (0-20)
- 20% × Spam Penalty
```

**Result**: Score between 0-100 (clamped)

## Setup Instructions

### 1. Get DataForSEO API Credentials

1. Visit [DataForSEO API Access](https://app.dataforseo.com/api-access)
2. Sign up or log in to your account
3. Navigate to API Access section
4. Copy your **username** and **password**

### 2. Configure Environment Variables

Create a `.env` file in the `aeo-api` directory (or update existing):

```bash
# DataForSEO API Configuration
DATAFORSEO_USERNAME=your_username_here
DATAFORSEO_PASSWORD=your_password_here
```

### 3. Test the Integration

Run the test script to verify everything works:

```bash
cd aeo-api
python test_competitor_analysis.py
```

Expected output:
- ✅ Credentials verification
- 📊 Service initialization
- 🔍 Domain analysis (takes 10-30 seconds)
- 📈 Detailed metrics and recommendations

## API Usage

### Through AEO Service (Recommended)

The competitor analysis is automatically included in the complete AEO analysis:

```python
from app.services.aeo_services_consolidated import AEOServiceOrchestrator

orchestrator = AEOServiceOrchestrator()
results = orchestrator.run_complete_analysis(
    url="https://example.com",
    html_content=None,  # Will be fetched automatically
    competitor_urls=[]  # Not needed for DataForSEO implementation
)

# Access competitor analysis
competitor_data = results['detailed_analysis']['competitor_analysis']
score = competitor_data['score']
metrics = competitor_data['metrics']
recommendations = competitor_data['recommendations']
```

### Direct Service Usage

For standalone competitor analysis:

```python
from app.services.competitor_analysis import CompetitorAnalysisService

service = CompetitorAnalysisService()
results = service.analyze_competitor_landscape("example.com")

print(f"Score: {results['score']}/100")
print(f"Referring Domains: {results['metrics']['total_referring_domains']}")
print(f"Recommendations: {results['recommendations']}")
```

### REST API Endpoint

```bash
POST /api/aeo/analyze
Content-Type: application/json

{
  "url": "https://example.com",
  "competitor_urls": []
}
```

Response includes:
```json
{
  "success": true,
  "results": {
    "detailed_analysis": {
      "competitor_analysis": {
        "score": 75.5,
        "metrics": {
          "total_referring_domains": 250,
          "dofollow_backlinks": 180,
          "domain_quality": 65.5,
          "diversity_score": 18,
          "spam_score": 12.3
        },
        "top_competitors": [...],
        "recommendations": [...]
      }
    }
  }
}
```

## Data Selection Logic

The service automatically optimizes data usage:

- **≤ 100 referring domains**: Uses ALL available data
- **> 100 referring domains**: Uses TOP 100 (sorted by domain rank)

Example:
- Website with 50 referring domains → Analyzes all 50
- Website with 2,500 referring domains → Analyzes top 100 by rank

This ensures:
- ✅ Accurate analysis for smaller sites
- ✅ Cost-effective for larger sites
- ✅ Focus on highest-quality backlinks

## Understanding the Metrics

### Total Referring Domains
Number of unique domains linking to your site. Higher is better.
- **< 10**: Very low, needs immediate attention
- **10-50**: Below average, room for improvement
- **50-200**: Good, competitive
- **> 200**: Excellent, strong profile

### Dofollow Backlinks
Links that pass SEO value. Ratio to total links matters.
- **< 50% dofollow**: Focus on quality link building
- **50-70% dofollow**: Good balance
- **> 70% dofollow**: Excellent link equity

### Domain Quality (0-100)
Average authority of linking domains.
- **< 30**: Low quality, target better domains
- **30-50**: Average, seek authoritative sites
- **50-70**: Good quality sources
- **> 70**: Excellent, high-authority backlinks

### Diversity Score (0-20)
Variety across TLDs, countries, and platforms.
- **< 10**: Limited diversity, expand reach
- **10-15**: Good diversity
- **15-20**: Excellent, well-diversified

### Spam Score
Average spam score of linking domains.
- **< 20**: Clean profile
- **20-30**: Monitor closely
- **30-50**: Consider disavowing some links
- **> 50**: URGENT - audit and disavow toxic links

## Troubleshooting

### "DataForSEO API not configured"
- Ensure `DATAFORSEO_USERNAME` and `DATAFORSEO_PASSWORD` are set in `.env`
- Check credentials are correct
- Verify `.env` file is in the correct directory

### "No backlinks data found"
- Domain may be very new with no backlinks yet
- API filters may be too restrictive
- Check domain spelling and format

### API Errors
- Verify your DataForSEO account has sufficient credits
- Check API status at [DataForSEO Status](https://status.dataforseo.com/)
- Review API limits and quotas in your account

## Cost Considerations

DataForSEO charges per API request. The competitor analysis makes:
- **1 API call** per domain analysis (standard case)
- **2 API calls** if total domains ≤ 100 and need to fetch all data

Typical costs:
- ~$0.02-0.05 per domain analysis
- Check current pricing at [DataForSEO Pricing](https://dataforseo.com/apis/backlinks-api)

## Files Modified/Created

### New Files
- `aeo-api/app/services/dataforseo_client.py` - REST client for DataForSEO API
- `aeo-api/test_competitor_analysis.py` - Test script
- `aeo-api/COMPETITOR_ANALYSIS_README.md` - This documentation

### Modified Files
- `aeo-api/app/services/competitor_analysis.py` - Complete rewrite with DataForSEO
- `aeo-api/env.example` - Added DataForSEO credentials

### Unchanged Files
- `aeo-api/app/services/aeo_services_consolidated.py` - No changes needed
- `aeo-api/app/routes/aeo.py` - No changes needed
- `aeo-api/requirements.txt` - No new dependencies (uses standard library)

## Benefits

✅ **Professional-grade data** from DataForSEO's comprehensive index  
✅ **Real-time analysis** of current backlink profiles  
✅ **Actionable insights** with specific recommendations  
✅ **Spam detection** to identify toxic backlinks  
✅ **Competitive intelligence** from top referring domains  
✅ **Automatic optimization** of data usage  
✅ **Easy integration** with existing AEO service  

## Support

For issues or questions:
1. Check this README first
2. Review DataForSEO API documentation: https://docs.dataforseo.com/
3. Test with the provided test script
4. Check API status and account credits

## Next Steps

1. ✅ Set up DataForSEO credentials
2. ✅ Run test script to verify
3. ✅ Analyze your domain
4. 📊 Review recommendations
5. 🚀 Implement link building strategies
6. 🔄 Monitor progress over time

