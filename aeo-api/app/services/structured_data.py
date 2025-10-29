"""
Structured Data Analysis Service for AEOCHECKER
Comprehensive structured data analyzer for AI Search Engine Optimization
"""

import requests
import extruct
import json
import re
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse
import logging

# Configure logging
logger = logging.getLogger(__name__)

@dataclass
class StructuredDataMetrics:
    """Data class to hold structured data metrics"""
    total_schemas: int
    valid_schemas: int
    invalid_schemas: int
    schema_types: List[str]
    coverage_score: float
    quality_score: float
    completeness_score: float
    seo_relevance_score: float
    errors: List[str]
    warnings: List[str]
    recommendations: List[str]
    coverage_explanation: str
    quality_explanation: str
    completeness_explanation: str
    seo_relevance_explanation: str
    # New: per-type details
    details: List[Dict[str, Any]]

class StructuredDataService:
    """
    Comprehensive structured data analyzer for AEO tools
    Analyzes JSON-LD, Microdata, RDFa, and other structured data formats
    """
    
    def __init__(self):
        self.supported_formats = ['json-ld', 'microdata', 'rdfa']
        self.important_schemas = [
            'Organization', 'WebSite', 'WebPage', 'Article', 'BlogPosting',
            'Product', 'Review', 'FAQPage', 'HowTo', 'Recipe', 'Event',
            'LocalBusiness', 'Person', 'BreadcrumbList', 'VideoObject', 'Language'
        ]
        self.seo_critical_schemas = [
            'Organization', 'WebSite', 'WebPage', 'Article', 'BreadPage'
        ]
        
        # Define relevant schemas for each website type
        self.website_type_schemas = {
            'ecommerce': {
                'relevant': ['Organization', 'WebSite', 'WebPage', 'Product', 'Review', 'BreadcrumbList'],
                'irrelevant': ['Recipe', 'Event', 'HowTo', 'LocalBusiness']
            },
            'restaurant': {
                'relevant': ['Organization', 'WebSite', 'WebPage', 'LocalBusiness', 'Event', 'Review'],
                'irrelevant': ['Product', 'Recipe', 'HowTo', 'Article']
            },
            'blog': {
                'relevant': ['Organization', 'WebSite', 'WebPage', 'Article', 'BlogPosting', 'Person'],
                'irrelevant': ['Product', 'LocalBusiness', 'Event']
            },
            'business': {
                'relevant': ['Organization', 'WebSite', 'WebPage', 'LocalBusiness', 'FAQPage'],
                'irrelevant': ['Product', 'Recipe', 'Event', 'HowTo']
            },
            'news': {
                'relevant': ['Organization', 'WebSite', 'WebPage', 'Article', 'Person'],
                'irrelevant': ['Product', 'LocalBusiness', 'Recipe', 'Event']
            },
            'saas': {
                'relevant': ['Organization', 'WebSite', 'WebPage', 'FAQPage', 'Article', 'BreadcrumbList'],
                'irrelevant': ['Product', 'Recipe', 'HowTo', 'LocalBusiness']
            },
            'portfolio': {
                'relevant': ['Organization', 'WebSite', 'WebPage', 'Person', 'BreadcrumbList', 'Article'],
                'irrelevant': ['Product', 'Recipe', 'HowTo', 'LocalBusiness']
            },
            'education': {
                'relevant': ['Organization', 'WebSite', 'WebPage', 'FAQPage', 'Article', 'Event'],
                'irrelevant': ['Product', 'Recipe', 'HowTo']
            },
            'healthcare': {
                'relevant': ['Organization', 'WebSite', 'WebPage', 'LocalBusiness', 'FAQPage', 'Review'],
                'irrelevant': ['Product', 'Recipe', 'HowTo']
            },
            'realestate': {
                'relevant': ['Organization', 'WebSite', 'WebPage', 'LocalBusiness', 'BreadcrumbList', 'FAQPage'],
                'irrelevant': ['Recipe', 'HowTo']
            },
            'jobboard': {
                'relevant': ['Organization', 'WebSite', 'WebPage', 'BreadcrumbList', 'Article'],
                'irrelevant': ['Product', 'Recipe', 'HowTo']
            },
            'nonprofit': {
                'relevant': ['Organization', 'WebSite', 'WebPage', 'Event', 'FAQPage', 'Article'],
                'irrelevant': ['Product', 'Recipe', 'HowTo']
            },
            'forum': {
                'relevant': ['Organization', 'WebSite', 'WebPage', 'BreadcrumbList', 'Article', 'Person'],
                'irrelevant': ['Product', 'Recipe']
            },
            'directory': {
                'relevant': ['Organization', 'WebSite', 'WebPage', 'BreadcrumbList', 'LocalBusiness'],
                'irrelevant': ['Product', 'Recipe']
            },
            'marketplace': {
                'relevant': ['Organization', 'WebSite', 'WebPage', 'Product', 'Review', 'BreadcrumbList'],
                'irrelevant': ['Recipe', 'HowTo']
            },
            'media': {
                'relevant': ['Organization', 'WebSite', 'WebPage', 'Article', 'VideoObject', 'Person'],
                'irrelevant': ['Product', 'Recipe']
            },
            'general': {
                'relevant': ['Organization', 'WebSite', 'WebPage'],
                'irrelevant': []
            }
        }
    
    def analyze_structured_data(self, url: str, html_content: str = None) -> Dict:
        """Main method for analyzing structured data"""
        try:
            if html_content is None:
                response = requests.get(url, timeout=10)
                response.raise_for_status()
                html_content = response.text
            
            # Extract structured data safely
            try:
                extracted_data = extruct.extract(html_content)
            except Exception as e:
                logger.error(f"extruct extraction error: {e}")
                # Fallback: try to extract JSON-LD manually
                extracted_data = {'json-ld': self._extract_jsonld_fallback(html_content)}
            
            metrics = self._analyze_extracted_data(extracted_data, url, html_content)
            
            # Calculate final score (average of all metrics, capped at 100)
            final_score = (metrics.coverage_score + metrics.quality_score + metrics.completeness_score + metrics.seo_relevance_score) / 4
            final_score = min(100.0, max(0.0, final_score))  # Cap between 0 and 100
            
            return {
                'score': final_score,
                'metrics': {
                    'coverage': metrics.coverage_score,
                    'quality': metrics.quality_score,
                    'completeness': metrics.completeness_score,
                    'seo_relevance': metrics.seo_relevance_score
                },
                'total_schemas': metrics.total_schemas,
                'valid_schemas': metrics.valid_schemas,
                'invalid_schemas': metrics.invalid_schemas,
                'schema_types': metrics.schema_types,
                'errors': metrics.errors,
                'warnings': metrics.warnings,
                'recommendations': metrics.recommendations,
                'explanations': {
                    'coverage': metrics.coverage_explanation,
                    'quality': metrics.quality_explanation,
                    'completeness': metrics.completeness_explanation,
                    'seo_relevance': metrics.seo_relevance_explanation
                },
                'details': metrics.details
            }
        except Exception as e:
            logger.error(f"Error analyzing structured data for {url}: {e}")
            return {
                'score': 0,
                'error': str(e),
                'recommendations': ['Check URL and try again']
            }
    
    def _analyze_extracted_data(self, data: Dict, url: str, html_content: str = "") -> StructuredDataMetrics:
        """Analyze extracted structured data"""
        errors = []
        warnings = []
        recommendations = []
        details: List[Dict[str, Any]] = []
        
        # Count total schemas
        total_schemas = 0
        valid_schemas = 0
        invalid_schemas = 0
        schema_types = []
        
        # Analyze each format
        for format_type in self.supported_formats:
            if format_type in data and data[format_type]:
                schemas = data[format_type]
                
                for schema in schemas:
                    # If this is a JSON-LD container with @graph, expand child nodes
                    if format_type == 'json-ld' and isinstance(schema, dict) and isinstance(schema.get('@graph'), list):
                        # Count children as schemas, not the container itself
                        graph_children = schema['@graph']
                        total_schemas += len(graph_children)
                        
                        for child in graph_children:
                            # Treat each child as an independent schema
                            child_type = self._get_schema_type(child)
                            if child_type:
                                schema_types.append(child_type)
                            is_valid_child, child_errors = self._validate_schema(child, format_type)
                            if is_valid_child:
                                valid_schemas += 1
                            else:
                                invalid_schemas += 1
                                errors.extend(child_errors)

                            missing_required_child: List[str] = []
                            if child_type:
                                required_props_child = self._get_required_properties(child_type)
                                missing_required_child = [prop for prop in required_props_child if prop not in child]
                            eligible_child = is_valid_child and not missing_required_child
                            details.append({
                                'type': child_type or 'Unknown',
                                'format': format_type,
                                'valid': is_valid_child,
                                'missing_required': missing_required_child,
                                'eligible': eligible_child
                            })
                        # Skip container record; already expanded
                        continue
                    
                    # Regular schema (not a @graph container)
                    total_schemas += 1
                    schema_type = self._get_schema_type(schema)
                    if schema_type:
                        schema_types.append(schema_type)
                    
                    # Validate schema
                    is_valid, schema_errors = self._validate_schema(schema, format_type)
                    if is_valid:
                        valid_schemas += 1
                    else:
                        invalid_schemas += 1
                        errors.extend(schema_errors)

                    # Capture per-type details (missing required fields)
                    missing_required: List[str] = []
                    if schema_type:
                        required_props = self._get_required_properties(schema_type)
                        missing_required = [prop for prop in required_props if prop not in schema]
                    # Simple eligibility heuristic: valid and has no missing required
                    eligible = is_valid and not missing_required
                    detail_row = {
                        'type': schema_type or 'Unknown',
                        'format': format_type,
                        'valid': is_valid,
                        'missing_required': missing_required,
                        'eligible': eligible
                    }
                    details.append(detail_row)
        
        # Detect website type for context-aware scoring
        website_type = self._detect_website_type(url, html_content, schema_types)
        
        # Calculate scores with context awareness
        coverage_score = self._calculate_coverage_score(schema_types, website_type)
        quality_score = self._calculate_quality_score(valid_schemas, total_schemas)
        completeness_score = self._calculate_completeness_score(data)
        seo_relevance_score = self._calculate_context_aware_seo_score(schema_types, website_type)
        
        # Generate explanations with context awareness
        coverage_explanation = self._get_context_aware_coverage_explanation(schema_types, coverage_score, website_type)
        quality_explanation = self._get_quality_explanation(valid_schemas, total_schemas, quality_score)
        completeness_explanation = self._get_completeness_explanation(data, completeness_score)
        seo_relevance_explanation = self._get_context_aware_seo_explanation(schema_types, seo_relevance_score, website_type)
        
        # Generate context-aware recommendations
        recommendations = self._generate_context_aware_recommendations(
            schema_types, coverage_score, quality_score, completeness_score, website_type
        )
        
        return StructuredDataMetrics(
            total_schemas=total_schemas,
            valid_schemas=valid_schemas,
            invalid_schemas=invalid_schemas,
            schema_types=schema_types,
            coverage_score=coverage_score,
            quality_score=quality_score,
            completeness_score=completeness_score,
            seo_relevance_score=seo_relevance_score,
            errors=errors,
            warnings=warnings,
            recommendations=recommendations,
            coverage_explanation=coverage_explanation,
            quality_explanation=quality_explanation,
            completeness_explanation=completeness_explanation,
            seo_relevance_explanation=seo_relevance_explanation,
            details=details
        )
    
    def _extract_jsonld_fallback(self, html_content: str) -> List[Dict]:
        """Fallback method to extract JSON-LD when extruct fails"""
        try:
            jsonld = []
            # Find all script tags with type="application/ld+json"
            script_pattern = r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>'
            matches = re.findall(script_pattern, html_content, re.DOTALL | re.IGNORECASE)
            
            for match in matches:
                try:
                    json_content = match.strip()
                    if json_content:
                        parsed = json.loads(json_content)
                        if isinstance(parsed, list):
                            jsonld.extend(parsed)
                        else:
                            jsonld.append(parsed)
                except (json.JSONDecodeError, ValueError):
                    continue
            
            return jsonld
        except Exception:
            return []
    
    def _detect_website_type(self, url: str, html_content: str, schema_types: List[str]) -> str:
        """Detect website type based on URL, content, and existing schemas"""
        try:
            url_lower = url.lower()
            content_lower = html_content.lower()
            
            if any(kw in content_lower for kw in ['add to cart', 'buy now', 'checkout']) or 'Product' in schema_types:
                return 'ecommerce'
            
            def has_any(text: str, kws: list) -> bool:
                return any(k in text for k in kws)
            
            if has_any(url_lower + ' ' + content_lower, ['saas', 'free trial', 'pricing', 'features']):
                return 'saas'
            if has_any(url_lower + ' ' + content_lower, ['portfolio', 'case study', 'case studies']):
                return 'portfolio'
            if has_any(url_lower + ' ' + content_lower, ['university', 'school', 'course']):
                return 'education'
            if has_any(url_lower + ' ' + content_lower, ['blog', 'article', 'post']):
                return 'blog'
            if has_any(url_lower + ' ' + content_lower, ['agency', 'services', 'consulting']):
                return 'business'
            
            return 'general'
        except Exception:
            return 'general'
    
    def _get_schema_type(self, schema: Dict) -> Optional[str]:
        """Extract schema type from structured data"""
        try:
            candidates = [
                schema.get('@type'),
                schema.get('itemType'),
                schema.get('itemtype'),
                schema.get('type'),
                schema.get('typeof'),
            ]
            
            raw = next((c for c in candidates if c), None)
            if raw is None:
                return None

            return self._normalize_schema_type_value(raw)
        except Exception:
            return None

    def _normalize_schema_type_value(self, raw: Any) -> Optional[str]:
        """Normalize schema type"""
        try:
            value: Optional[str] = None
            if isinstance(raw, list) and raw:
                for item in raw:
                    if isinstance(item, str) and item.strip():
                        token = item.strip().split()[0]
                        if token:
                            value = token
                            break
            elif isinstance(raw, str):
                value = raw.strip().split()[0]

            if not value:
                return None

            if value.startswith('http://') or value.startswith('https://'):
                last = value.rstrip('/').split('/')[-1]
                if last:
                    value = last

            if ':' in value and value.split(':', 1)[0].lower() in ['schema', 'rdf', 'rdfa', 'vocab']:
                value = value.split(':', 1)[1]

            return value
        except Exception:
            return None
    
    def _validate_schema(self, schema: Dict, format_type: str) -> Tuple[bool, List[str]]:
        """Validate a single schema"""
        errors = []
        
        if not schema:
            errors.append("Empty schema")
            return False, errors
        
        if format_type == 'json-ld':
            if '@type' not in schema:
                errors.append("JSON-LD schema missing @type")
        
        elif format_type == 'microdata':
            if 'itemType' not in schema:
                errors.append("Microdata schema missing itemType")
        
        schema_type = self._get_schema_type(schema)
        if schema_type:
            required_props = self._get_required_properties(schema_type)
            missing_props = [prop for prop in required_props if prop not in schema]
            if missing_props:
                errors.append(f"Missing required properties: {', '.join(missing_props)}")
        
        return len(errors) == 0, errors
    
    def _get_required_properties(self, schema_type: str) -> List[str]:
        """Get required properties for a schema type"""
        required_props = {
            'Organization': ['name'],
            'WebSite': ['name', 'url'],
            'WebPage': ['name', 'url'],
            'Article': ['headline', 'author'],
            'Product': ['name', 'description'],
            'Person': ['name'],
            'LocalBusiness': ['name', 'address'],
            'Event': ['name', 'startDate'],
            'FAQPage': ['mainEntity'],
        }
        return required_props.get(schema_type, [])
    
    def _calculate_coverage_score(self, schema_types: List[str], website_type: Optional[str] = None) -> float:
        """Calculate coverage score"""
        if not schema_types:
            return 0.0
        
        unique_types = set(schema_types)
        
        if website_type:
            type_config = self.website_type_schemas.get(website_type, self.website_type_schemas['general'])
            relevant = type_config['relevant']
            if not relevant:
                return 0.0
            found_relevant = sum(1 for schema in unique_types if schema in relevant)
            base_score = (found_relevant / len(relevant)) * 60
            
            critical_within_type = [s for s in self.seo_critical_schemas if s in relevant]
            if critical_within_type:
                found_critical = sum(1 for schema in unique_types if schema in critical_within_type)
                bonus = (found_critical / len(critical_within_type)) * 40
            else:
                bonus = 0.0
            
            return min(100.0, base_score + bonus)
        
        important_found = sum(1 for schema in unique_types if schema in self.important_schemas)
        base_score = (important_found / len(self.important_schemas)) * 60
        seo_critical_found = sum(1 for schema in unique_types if schema in self.seo_critical_schemas)
        seo_bonus = (seo_critical_found / len(self.seo_critical_schemas)) * 40
        return min(100.0, base_score + seo_bonus)
    
    def _calculate_quality_score(self, valid_schemas: int, total_schemas: int) -> float:
        """Calculate quality score"""
        if total_schemas == 0:
            return 0.0
        score = (valid_schemas / total_schemas) * 100
        return min(100.0, max(0.0, score))  # Cap between 0 and 100
    
    def _get_quality_explanation(self, valid_schemas: int, total_schemas: int, score: float) -> str:
        """Get quality explanation"""
        if total_schemas == 0:
            return "No schemas found to validate."
        
        if score == 100:
            return f"Excellent! All {valid_schemas} schema(s) are valid and properly formatted."
        elif score >= 80:
            return f"Good quality. {valid_schemas}/{total_schemas} schemas are valid."
        elif score >= 60:
            return f"Moderate quality. {valid_schemas}/{total_schemas} schemas are valid."
        else:
            return f"Poor quality. Only {valid_schemas}/{total_schemas} schemas are valid."
    
    def _calculate_completeness_score(self, data: Dict) -> float:
        """Calculate completeness score"""
        score = 0.0
        max_score = 100.0
        
        formats_present = sum(1 for fmt in self.supported_formats if fmt in data and data[fmt])
        score += (formats_present / len(self.supported_formats)) * 30
        
        if 'json-ld' in data and data['json-ld']:
            json_ld_schemas = data['json-ld']
            rich_content_score = 0
            for schema in json_ld_schemas:
                if len(schema) > 5:
                    rich_content_score += 10
            score += min(40, rich_content_score)
        
        if 'json-ld' in data and data['json-ld']:
            for schema in data['json-ld']:
                if self._has_nested_objects(schema):
                    score += 15
        
        return min(max_score, score)
    
    def _get_completeness_explanation(self, data: Dict, score: float) -> str:
        """Get completeness explanation"""
        if score == 0:
            return "No structured data found."
        
        if score < 30:
            return "Schemas are very basic. Add more properties."
        elif score < 60:
            return "Schemas need more detail. Add nested objects and rich content."
        elif score < 80:
            return "Good detail level. Consider adding more specialized properties."
        else:
            return "Excellent completeness with rich, detailed structured data."
    
    def _has_nested_objects(self, obj: Dict) -> bool:
        """Check if object has nested structured data"""
        for value in obj.values():
            if isinstance(value, dict) and ('@type' in value or 'itemType' in value):
                return True
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict) and ('@type' in item or 'itemType' in item):
                        return True
        return False
    
    def _calculate_context_aware_seo_score(self, schema_types: List[str], website_type: str) -> float:
        """Calculate context-aware SEO score"""
        if not schema_types:
            return 0.0
        
        type_config = self.website_type_schemas.get(website_type, self.website_type_schemas['general'])
        relevant_schemas = type_config['relevant']
        irrelevant_schemas = type_config['irrelevant']
        
        unique_types = set(schema_types)
        score = 0.0
        
        seo_weight = {
            'Organization': 25, 'WebSite': 20, 'WebPage': 15, 'Article': 20,
            'Product': 15, 'Review': 10, 'FAQPage': 15, 'LocalBusiness': 15,
        }
        
        for schema in unique_types:
            if schema in relevant_schemas:
                score += seo_weight.get(schema, 5) * 1.2
            elif schema not in irrelevant_schemas:
                score += seo_weight.get(schema, 5)
            else:
                score += seo_weight.get(schema, 5) * 0.3
        
        return min(100.0, max(0.0, score))
    
    def _get_context_aware_coverage_explanation(self, schema_types: List[str], score: float, website_type: str) -> str:
        """Get context-aware coverage explanation"""
        if not schema_types:
            return "No structured data found."
        
        type_config = self.website_type_schemas.get(website_type, self.website_type_schemas['general'])
        relevant_schemas = type_config['relevant']
        unique_types = set(schema_types)
        
        explanation = f"Website type: {website_type.title()}. Found {len(unique_types)} schema type(s): {', '.join(unique_types)}. "
        
        missing_relevant = [schema for schema in relevant_schemas if schema not in unique_types]
        if missing_relevant:
            explanation += f"Missing: {', '.join(missing_relevant[:3])}."
        
        return explanation
    
    def _get_context_aware_seo_explanation(self, schema_types: List[str], score: float, website_type: str) -> str:
        """Get context-aware SEO explanation"""
        if not schema_types:
            return "No structured data found. Add SEO-critical schemas."
        return f"Website type: {website_type.title()}. SEO relevance: {score:.1f}/100"
    
    def _generate_context_aware_recommendations(self, schema_types: List[str], coverage_score: float, 
                                quality_score: float, completeness_score: float, website_type: str) -> List[str]:
        """Generate context-aware, specific recommendations"""
        recommendations = []
        
        type_config = self.website_type_schemas.get(website_type, self.website_type_schemas['general'])
        relevant_schemas = type_config['relevant']
        
        unique_types = set(schema_types)
        missing_relevant = [schema for schema in relevant_schemas if schema not in unique_types]
        
        if missing_relevant:
            schema_list = ', '.join(missing_relevant[:2])
            recommendations.append(f"Add {schema_list} schemas to improve {website_type} visibility and AI understanding")
        
        if quality_score < 70:
            error_pct = 100 - quality_score
            recommendations.append(f"Fix validation errors in existing schemas (currently {error_pct:.0f}% error rate) to ensure proper AI parsing")
        
        if coverage_score < 50:
            recommendations.append(f"Add more {website_type}-specific schemas to improve structured data coverage and search visibility")
        
        # Check for Organization schema specifically
        if 'Organization' in unique_types:
            # Check for sameAs property (would need to check details, but provide general recommendation)
            recommendations.append("Add Wikidata, Wikipedia, LinkedIn, Twitter, or other social profiles to Organization.sameAs property for better entity recognition")
        
        if 'Organization' not in unique_types and website_type in ['saas', 'business', 'general']:
            recommendations.append("Add Organization schema markup to establish your brand identity for AI systems")
        
        if website_type == 'saas' and 'WebSite' not in unique_types:
            recommendations.append("Add WebSite and WebPage schemas for SaaS optimization and better AI crawler understanding")
        
        return recommendations
