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
from w3lib.html import get_base_url
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

class StructuredDataAnalyzer:
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
    
    def _detect_website_type(self, url: str, html_content: str, schema_types: List[str]) -> str:
        """Detect website type based on URL, content, and existing schemas"""
        try:
            # Normalize
            url_lower = url.lower()
            content_lower = html_content.lower()
            
            # Strong ecommerce confirmation signals
            if any(kw in content_lower for kw in ['add to cart', 'buy now', 'checkout']) or 'Product' in schema_types:
                return 'ecommerce'
            
            # Category keyword heuristics (URL + content)
            def has_any(text: str, kws: list) -> bool:
                return any(k in text for k in kws)
            
            if has_any(url_lower + ' ' + content_lower, ['saas', 'free trial', 'pricing', 'features']):
                return 'saas'
            if has_any(url_lower + ' ' + content_lower, ['portfolio', 'case study', 'case studies', 'works', 'projects']):
                return 'portfolio'
            if has_any(url_lower + ' ' + content_lower, ['university', 'school', 'course', 'curriculum', 'learn more']):
                return 'education'
            if has_any(url_lower + ' ' + content_lower, ['clinic', 'hospital', 'doctor', 'patients', 'appointments']):
                return 'healthcare'
            if has_any(url_lower + ' ' + content_lower, ['real estate', 'realtor', 'listings', 'property', 'rent']):
                return 'realestate'
            if has_any(url_lower + ' ' + content_lower, ['jobs', 'careers', 'hiring', 'apply now']):
                return 'jobboard'
            if has_any(url_lower + ' ' + content_lower, ['nonprofit', 'donate', 'mission', 'volunteer']):
                return 'nonprofit'
            if has_any(url_lower + ' ' + content_lower, ['forum', 'threads', 'discussions', 'community']):
                return 'forum'
            if has_any(url_lower + ' ' + content_lower, ['directory', 'businesses', 'listings', 'find near']):
                return 'directory'
            if has_any(url_lower + ' ' + content_lower, ['marketplace', 'sellers', 'buyers']):
                return 'marketplace'
            if has_any(url_lower + ' ' + content_lower, ['news', 'press', 'breaking', 'publisher']):
                return 'news'
            
            # Agency/business signals
            if has_any(url_lower + ' ' + content_lower, ['agency', 'services', 'service', 'marketing', 'seo', 'ppc', 'consulting', 'audit']):
                return 'business'
            
            # Blog
            if has_any(url_lower + ' ' + content_lower, ['blog', 'article', 'post']):
                return 'blog'
            
            # Local business fallback
            if 'LocalBusiness' in schema_types:
                return 'business'
            
            return 'general'
        except Exception:
            return 'general'
    
    def analyze_url(self, url: str) -> StructuredDataMetrics:
        """
        Analyze structured data for a given URL
        
        Args:
            url: The URL to analyze
            
        Returns:
            StructuredDataMetrics object with analysis results
        """
        try:
            # Fetch and parse the webpage
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            html = response.text
            base_url = get_base_url(html, url)
            
            # Extract structured data
            extracted_data = extruct.extract(html, base_url=base_url)
            
            return self._analyze_extracted_data(extracted_data, url, html)
            
        except requests.RequestException as e:
            logger.error(f"Error fetching URL {url}: {e}")
            return self._create_error_metrics([f"Failed to fetch URL: {e}"])
        except Exception as e:
            logger.error(f"Error analyzing URL {url}: {e}")
            return self._create_error_metrics([f"Analysis error: {e}"])
    
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
                total_schemas += len(schemas)
                
                for schema in schemas:
                    # If this is a JSON-LD container with @graph, expand child nodes
                    if format_type == 'json-ld' and isinstance(schema, dict) and isinstance(schema.get('@graph'), list):
                        for child in schema['@graph']:
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
                    # If still Unknown, surface hints for debugging in frontend
                    if not schema_type:
                        try:
                            raw_keys = list(schema.keys())
                        except Exception:
                            raw_keys = []
                        # candidates from common rdfa fields
                        raw_candidates = {
                            'typeof': schema.get('typeof') or schema.get('typeOf') or schema.get('type'),
                            'itemtype': schema.get('itemtype') or schema.get('itemType')
                        }
                        # Heuristic labeling for non-schema metadata
                        label = None
                        joined_keys = ' '.join(str(k) for k in raw_keys)
                        if 'ogp.me/ns#' in joined_keys:
                            label = 'OpenGraph'
                        elif 'twitter.com/cards' in joined_keys or 'twitter:' in joined_keys.lower():
                            label = 'TwitterCard'
                        elif 'w3.org/1999/xhtml/vocab#role' in joined_keys:
                            label = 'XHTMLRole'
                        if label:
                            detail_row['type'] = label
                        # add to detail row
                        detail_row['raw_keys'] = raw_keys
                        detail_row['raw_candidates'] = raw_candidates
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
        try:
            recommendations = self._generate_context_aware_recommendations(
                schema_types, coverage_score, quality_score, completeness_score, website_type
            )
        except AttributeError:
            # Fallback to legacy method if new method not found
            recommendations = self._generate_recommendations(
                schema_types, coverage_score, quality_score, completeness_score
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
    
    def _get_schema_type(self, schema: Dict) -> Optional[str]:
        """Extract schema type from structured data across formats/cases and normalize."""
        try:
            # Try common keys (case-sensitive)
            candidates = [
                schema.get('@type'),
                schema.get('itemType'),
                schema.get('itemtype'),
                schema.get('type'),
                schema.get('typeof'),
                schema.get('typeOf'),
            ]
            # If not found, try case-insensitive lookup
            if not any(candidates):
                lower_map = {str(k).lower(): v for k, v in schema.items()}
                for k in ['@type', 'itemtype', 'type', 'typeof']:
                    if k in lower_map:
                        candidates.append(lower_map[k])
                        break

            # Pick first non-empty
            raw = next((c for c in candidates if c), None)
            if raw is None:
                return None

            # Normalize value (may be list or URL)
            return self._normalize_schema_type_value(raw)
        except Exception:
            return None

    def _normalize_schema_type_value(self, raw: Any) -> Optional[str]:
        """Normalize schema type: pick first from list; strip schema URLs to local name."""
        try:
            value: Optional[str] = None
            if isinstance(raw, list) and raw:
                # Prefer first recognizable string
                for item in raw:
                    if isinstance(item, str) and item.strip():
                        # Some RDFa provide space-separated CURIEs: take first token
                        token = item.strip().split()[0]
                        if token:
                            value = token
                            break
            elif isinstance(raw, str):
                # Some RDFa provide multiple tokens: take first
                value = raw.strip().split()[0]

            if not value:
                return None

            # If it's a URL like https://schema.org/FAQPage -> take last segment
            if value.startswith('http://') or value.startswith('https://'):
                last = value.rstrip('/').split('/')[-1]
                if last:
                    value = last

            # Common RDFa CURIE like schema:FAQPage -> take local part
            if ':' in value and value.split(':', 1)[0].lower() in ['schema', 'rdf', 'rdfa', 'vocab']:
                value = value.split(':', 1)[1]

            return value
        except Exception:
            return None
    
    def _validate_schema(self, schema: Dict, format_type: str) -> Tuple[bool, List[str]]:
        """Validate a single schema and return validation results"""
        errors = []
        
        # Basic validation
        if not schema:
            errors.append("Empty schema")
            return False, errors
        
        # Format-specific validation
        if format_type == 'json-ld':
            if '@type' not in schema:
                errors.append("JSON-LD schema missing @type")
            if '@context' not in schema:
                errors.append("JSON-LD schema missing @context")
        
        elif format_type == 'microdata':
            if 'itemType' not in schema:
                errors.append("Microdata schema missing itemType")
        
        # Check for required properties based on schema type
        schema_type = self._get_schema_type(schema)
        if schema_type:
            required_props = self._get_required_properties(schema_type)
            missing_props = [prop for prop in required_props if prop not in schema]
            if missing_props:
                errors.append(f"Missing required properties for {schema_type}: {', '.join(missing_props)}")
        
        return len(errors) == 0, errors
    
    def _get_required_properties(self, schema_type: str) -> List[str]:
        """Get required properties for a schema type"""
        required_props = {
            'Organization': ['name'],
            'WebSite': ['name', 'url'],
            'WebPage': ['name', 'url'],
            'Article': ['headline', 'author', 'datePublished'],
            'Product': ['name', 'description'],
            'Person': ['name'],
            'LocalBusiness': ['name', 'address'],
            'Event': ['name', 'startDate'],
            'FAQPage': ['mainEntity'],
            'HowTo': ['name', 'step'],
            'Recipe': ['name', 'ingredients', 'instructions']
        }
        return required_props.get(schema_type, [])
    
    def _calculate_coverage_score(self, schema_types: List[str], website_type: Optional[str] = None) -> float:
        """Calculate how well the page covers relevant schema types"""
        if not schema_types:
            return 0.0
        
        unique_types = set(schema_types)
        
        # If website type is provided, compute coverage against its relevant set
        if website_type:
            type_config = self.website_type_schemas.get(website_type, self.website_type_schemas['general'])
            relevant = type_config['relevant']
            if not relevant:
                return 0.0
            found_relevant = sum(1 for schema in unique_types if schema in relevant)
            # Base score from relevant schemas
            base_score = (found_relevant / len(relevant)) * 60
            
            # Bonus for SEO-critical within type (intersection with global critical list)
            critical_within_type = [s for s in self.seo_critical_schemas if s in relevant]
            if critical_within_type:
                found_critical = sum(1 for schema in unique_types if schema in critical_within_type)
                bonus = (found_critical / len(critical_within_type)) * 40
            else:
                bonus = 0.0
            
            return min(100.0, base_score + bonus)
        
        # Fallback to legacy global important/critical coverage
        important_found = sum(1 for schema in unique_types if schema in self.important_schemas)
        base_score = (important_found / len(self.important_schemas)) * 60
        seo_critical_found = sum(1 for schema in unique_types if schema in self.seo_critical_schemas)
        seo_bonus = (seo_critical_found / len(self.seo_critical_schemas)) * 40
        return min(100.0, base_score + seo_bonus)
    
    def _get_coverage_explanation(self, schema_types: List[str], score: float) -> str:
        """Get detailed explanation for coverage score"""
        if not schema_types:
            return "No structured data found. Add any schema types to start improving your coverage score."
        
        unique_types = set(schema_types)
        missing_important = [schema for schema in self.important_schemas if schema not in unique_types]
        missing_seo_critical = [schema for schema in self.seo_critical_schemas if schema not in unique_types]
        
        explanation = f"Found {len(unique_types)} schema type(s): {', '.join(unique_types)}. "
        
        if missing_seo_critical:
            explanation += f"Missing SEO-critical schemas: {', '.join(missing_seo_critical)}. "
        
        if missing_important:
            explanation += f"Missing important schemas: {', '.join(missing_important[:5])}. "
            if len(missing_important) > 5:
                explanation += f"and {len(missing_important) - 5} more. "
        
        if score < 30:
            explanation += "Add Organization and WebSite schemas to significantly improve your score."
        elif score < 60:
            explanation += "Add more content-specific schemas like Article, Product, or LocalBusiness."
        elif score < 80:
            explanation += "Consider adding specialized schemas like FAQPage, HowTo, or Review."
        
        return explanation
    
    def _get_context_aware_coverage_explanation(self, schema_types: List[str], score: float, website_type: str) -> str:
        """Get context-aware coverage explanation"""
        if not schema_types:
            return "No structured data found. Add any schema types to start improving your coverage score."
        
        # Get relevant schemas for this website type
        type_config = self.website_type_schemas.get(website_type, self.website_type_schemas['general'])
        relevant_schemas = type_config['relevant']
        irrelevant_schemas = type_config['irrelevant']
        
        unique_types = set(schema_types)
        relevant_found = [schema for schema in unique_types if schema in relevant_schemas]
        irrelevant_found = [schema for schema in unique_types if schema in irrelevant_schemas]
        neutral_found = [schema for schema in unique_types if schema not in relevant_schemas and schema not in irrelevant_schemas]
        
        explanation = f"Website type: {website_type.title()}. Found {len(unique_types)} schema type(s): {', '.join(unique_types)}. "
        
        if relevant_found:
            explanation += f"✅ Context-relevant schemas: {', '.join(relevant_found)}. "
        
        if irrelevant_found:
            explanation += f"⚠️ Irrelevant schemas: {', '.join(irrelevant_found)} (may confuse search engines). "
        
        if neutral_found:
            explanation += f"ℹ️ Neutral schemas: {', '.join(neutral_found)}. "
        
        # Context-specific recommendations
        missing_relevant = [schema for schema in relevant_schemas if schema not in unique_types]
        if missing_relevant:
            explanation += f"Missing context-relevant schemas: {', '.join(missing_relevant[:3])}. "
        
        if score < 30:
            if missing_relevant:
                explanation += f"Add {', '.join(missing_relevant[:2])} schemas for {website_type} optimization."
            else:
                explanation += f"Add more {website_type}-specific schemas to improve coverage."
        elif score < 60:
            explanation += f"Add more {website_type}-specific schemas to improve coverage."
        elif score < 80:
            explanation += f"Consider adding specialized schemas for {website_type} websites."
        else:
            explanation += f"Excellent {website_type} schema coverage!"
        
        return explanation
    
    def _calculate_quality_score(self, valid_schemas: int, total_schemas: int) -> float:
        """Calculate quality score based on valid vs total schemas"""
        if total_schemas == 0:
            return 0.0
        return (valid_schemas / total_schemas) * 100
    
    def _get_quality_explanation(self, valid_schemas: int, total_schemas: int, score: float) -> str:
        """Get detailed explanation for quality score"""
        if total_schemas == 0:
            return "No schemas found to validate."
        
        invalid_count = total_schemas - valid_schemas
        
        if score == 100:
            return f"Excellent! All {valid_schemas} schema(s) are valid and properly formatted."
        elif score >= 80:
            return f"Good quality. {valid_schemas}/{total_schemas} schemas are valid. {invalid_count} schema(s) have validation errors."
        elif score >= 60:
            return f"Moderate quality. {valid_schemas}/{total_schemas} schemas are valid. {invalid_count} schema(s) need fixing."
        else:
            return f"Poor quality. Only {valid_schemas}/{total_schemas} schemas are valid. {invalid_count} schema(s) have serious validation errors that need immediate attention."
    
    def _calculate_completeness_score(self, data: Dict) -> float:
        """Calculate completeness score based on data richness"""
        score = 0.0
        max_score = 100.0
        
        # Check for different formats
        formats_present = sum(1 for fmt in self.supported_formats if fmt in data and data[fmt])
        score += (formats_present / len(self.supported_formats)) * 30
        
        # Check for rich content
        if 'json-ld' in data and data['json-ld']:
            json_ld_schemas = data['json-ld']
            rich_content_score = 0
            for schema in json_ld_schemas:
                if len(schema) > 5:  # Rich schema with many properties
                    rich_content_score += 10
            score += min(40, rich_content_score)
        
        # Check for nested structures
        if 'json-ld' in data and data['json-ld']:
            for schema in data['json-ld']:
                if self._has_nested_objects(schema):
                    score += 15
        
        return min(max_score, score)
    
    def _get_completeness_explanation(self, data: Dict, score: float) -> str:
        """Get detailed explanation for completeness score"""
        formats_present = sum(1 for fmt in self.supported_formats if fmt in data and data[fmt])
        total_schemas = sum(len(data.get(fmt, [])) for fmt in self.supported_formats)
        
        if score == 0:
            return "No structured data found. Add any schema to start improving completeness."
        
        explanation = f"Found {total_schemas} schema(s) in {formats_present} format(s). "
        
        if score < 30:
            explanation += "Schemas are very basic. Add more properties like descriptions, images, dates, and contact information."
        elif score < 60:
            explanation += "Schemas need more detail. Add nested objects, rich content, and comprehensive property sets."
        elif score < 80:
            explanation += "Good detail level. Consider adding more specialized properties and nested structures."
        else:
            explanation += "Excellent completeness with rich, detailed structured data."
        
        return explanation
    
    def _has_nested_objects(self, obj: Dict) -> bool:
        """Check if object has nested structured data objects"""
        for value in obj.values():
            if isinstance(value, dict) and ('@type' in value or 'itemType' in value):
                return True
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict) and ('@type' in item or 'itemType' in item):
                        return True
        return False
    
    def _calculate_context_aware_seo_score(self, schema_types: List[str], website_type: str) -> float:
        """Calculate context-aware SEO relevance score"""
        if not schema_types:
            return 0.0
        
        # Get relevant and irrelevant schemas for this website type
        type_config = self.website_type_schemas.get(website_type, self.website_type_schemas['general'])
        relevant_schemas = type_config['relevant']
        irrelevant_schemas = type_config['irrelevant']
        
        unique_types = set(schema_types)
        score = 0.0
        
        # Base scoring weights
        seo_weight = {
            'Organization': 25,
            'WebSite': 20,
            'WebPage': 15,
            'Article': 20,
            'BlogPosting': 15,
            'Product': 15,
            'Review': 10,
            'FAQPage': 15,
            'HowTo': 10,
            'Recipe': 10,
            'Event': 10,
            'LocalBusiness': 15,
            'Person': 10,
            'BreadcrumbList': 10,
            'VideoObject': 10
        }
        
        # Score relevant schemas (bonus for context-appropriate schemas)
        for schema in unique_types:
            if schema in relevant_schemas:
                score += seo_weight.get(schema, 5) * 1.2  # 20% bonus for relevant schemas
            elif schema not in irrelevant_schemas:
                score += seo_weight.get(schema, 5)  # Normal score for neutral schemas
            else:
                score += seo_weight.get(schema, 5) * 0.3  # 70% penalty for irrelevant schemas
        
        return min(100.0, max(0.0, score))
    
    def _calculate_seo_relevance_score(self, schema_types: List[str]) -> float:
        """Calculate SEO relevance score (legacy method for backward compatibility)"""
        if not schema_types:
            return 0.0
        
        seo_weight = {
            'Organization': 25,
            'WebSite': 20,
            'WebPage': 15,
            'Article': 20,
            'BlogPosting': 15,
            'Product': 15,
            'Review': 10,
            'FAQPage': 15,
            'HowTo': 10,
            'Recipe': 10,
            'Event': 10,
            'LocalBusiness': 15,
            'Person': 10,
            'BreadcrumbList': 10,
            'VideoObject': 10
        }
        
        unique_types = set(schema_types)
        total_score = sum(seo_weight.get(schema, 5) for schema in unique_types)
        return min(100.0, total_score)
    
    def _get_context_aware_seo_explanation(self, schema_types: List[str], score: float, website_type: str) -> str:
        """Get context-aware SEO relevance explanation"""
        if not schema_types:
            return "No structured data found. Add SEO-critical schemas like Organization and WebSite to improve search rankings."
        
        # Get relevant and irrelevant schemas for this website type
        type_config = self.website_type_schemas.get(website_type, self.website_type_schemas['general'])
        relevant_schemas = type_config['relevant']
        irrelevant_schemas = type_config['irrelevant']
        
        unique_types = set(schema_types)
        relevant_found = [schema for schema in unique_types if schema in relevant_schemas]
        irrelevant_found = [schema for schema in unique_types if schema in irrelevant_schemas]
        
        explanation = f"Website type: {website_type.title()}. Found {len(unique_types)} schema type(s). "
        
        if relevant_found:
            explanation += f"Context-relevant schemas: {', '.join(relevant_found)}. "
        else:
            explanation += f"Missing context-relevant schemas for {website_type} websites. "
        
        if irrelevant_found:
            explanation += f"⚠️ Irrelevant schemas detected: {', '.join(irrelevant_found)} (may confuse search engines). "
        
        # Context-specific recommendations
        if website_type == 'ecommerce':
            if score < 50:
                explanation += "Add Product and Review schemas for e-commerce optimization."
        elif website_type == 'restaurant':
            if score < 50:
                explanation += "Add LocalBusiness and Event schemas for restaurant optimization."
        elif website_type == 'blog':
            if score < 50:
                explanation += "Add Article and BlogPosting schemas for content optimization."
        elif website_type == 'business':
            if score < 50:
                explanation += "Add LocalBusiness and FAQPage schemas for business optimization."
        
        if score >= 80:
            explanation += "Excellent context-aware SEO optimization!"
        
        return explanation
    
    def _get_seo_relevance_explanation(self, schema_types: List[str], score: float) -> str:
        """Get detailed explanation for SEO relevance score (legacy method)"""
        if not schema_types:
            return "No structured data found. Add SEO-critical schemas like Organization and WebSite to improve search rankings."
        
        unique_types = set(schema_types)
        seo_critical_found = [schema for schema in unique_types if schema in self.seo_critical_schemas]
        high_value_found = [schema for schema in unique_types if schema in ['Article', 'Product', 'Review', 'FAQPage', 'LocalBusiness']]
        
        explanation = f"Found {len(unique_types)} schema type(s). "
        
        if seo_critical_found:
            explanation += f"SEO-critical schemas present: {', '.join(seo_critical_found)}. "
        else:
            explanation += "Missing SEO-critical schemas (Organization, WebSite, WebPage). "
        
        if high_value_found:
            explanation += f"High-value schemas found: {', '.join(high_value_found)}. "
        
        if score < 30:
            explanation += "Add Organization schema (25 points) and WebSite schema (20 points) for immediate improvement."
        elif score < 60:
            explanation += "Add Article, Product, or LocalBusiness schemas to boost SEO relevance."
        elif score < 80:
            explanation += "Consider adding Review, FAQPage, or HowTo schemas for specialized content."
        else:
            explanation += "Excellent SEO relevance with comprehensive schema coverage."
        
        return explanation
    
    def _generate_context_aware_recommendations(self, schema_types: List[str], coverage_score: float, 
                                quality_score: float, completeness_score: float, website_type: str) -> List[str]:
        """Generate context-aware actionable recommendations"""
        recommendations = []
        
        # Get relevant schemas for this website type
        type_config = self.website_type_schemas.get(website_type, self.website_type_schemas['general'])
        relevant_schemas = type_config['relevant']
        irrelevant_schemas = type_config['irrelevant']
        
        unique_types = set(schema_types)
        missing_relevant = [schema for schema in relevant_schemas if schema not in unique_types]
        irrelevant_found = [schema for schema in unique_types if schema in irrelevant_schemas]
        
        # Context-specific recommendations
        if missing_relevant:
            recommendations.append(f"Add {', '.join(missing_relevant[:2])} schemas for {website_type} optimization")
        
        if irrelevant_found:
            recommendations.append(f"Remove irrelevant {', '.join(irrelevant_found)} schemas (not suitable for {website_type} websites)")
        
        # Quality recommendations
        if quality_score < 70:
            recommendations.append("Fix validation errors in existing schemas")
        
        # Coverage recommendations
        if coverage_score < 50:
            recommendations.append(f"Add more {website_type}-specific schemas to improve coverage")
        
        return recommendations
    
    def _generate_recommendations(self, schema_types: List[str], coverage_score: float, 
                                quality_score: float, completeness_score: float) -> List[str]:
        """Generate actionable recommendations (legacy method)"""
        recommendations = []
        
        # Coverage recommendations
        if coverage_score < 60:
            recommendations.append("Add more important schema types like Organization, WebSite, and WebPage")
        
        missing_important = [schema for schema in self.seo_critical_schemas if schema not in schema_types]
        if missing_important:
            recommendations.append(f"Consider adding these SEO-critical schemas: {', '.join(missing_important)}")
        
        # Quality recommendations
        if quality_score < 80:
            recommendations.append("Fix validation errors in existing structured data")
            recommendations.append("Ensure all schemas have required properties")
        
        # Completeness recommendations
        if completeness_score < 70:
            recommendations.append("Add more detailed properties to existing schemas")
            recommendations.append("Consider adding nested objects for richer data")
        
        # Specific recommendations based on content type
        if 'Article' in schema_types or 'BlogPosting' in schema_types:
            recommendations.append("Ensure article schemas include author, datePublished, and dateModified")
        
        if 'Product' in schema_types:
            recommendations.append("Add price, availability, and review data to product schemas")
        
        if 'LocalBusiness' in schema_types:
            recommendations.append("Include complete address, phone, and business hours in LocalBusiness schema")
        
        return recommendations
    
    def _create_error_metrics(self, errors: List[str]) -> StructuredDataMetrics:
        """Create metrics object for error cases"""
        return StructuredDataMetrics(
            total_schemas=0,
            valid_schemas=0,
            invalid_schemas=0,
            schema_types=[],
            coverage_score=0.0,
            quality_score=0.0,
            completeness_score=0.0,
            seo_relevance_score=0.0,
            errors=errors,
            warnings=[],
            recommendations=["Fix the errors above to enable structured data analysis"],
            coverage_explanation="Unable to analyze coverage due to errors.",
            quality_explanation="Unable to analyze quality due to errors.",
            completeness_explanation="Unable to analyze completeness due to errors.",
            seo_relevance_explanation="Unable to analyze SEO relevance due to errors.",
            details=[]
        )
    
    def generate_report(self, metrics: StructuredDataMetrics, url: str) -> str:
        """Generate a detailed report of structured data analysis"""
        report = f"""
# Structured Data Analysis Report
**URL:** {url}
**Analysis Date:** {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## Summary
- **Total Schemas Found:** {metrics.total_schemas}
- **Valid Schemas:** {metrics.valid_schemas}
- **Invalid Schemas:** {metrics.invalid_schemas}
- **Schema Types:** {', '.join(metrics.schema_types) if metrics.schema_types else 'None'}

## Scores
- **Coverage Score:** {metrics.coverage_score:.1f}/100
- **Quality Score:** {metrics.quality_score:.1f}/100
- **Completeness Score:** {metrics.completeness_score:.1f}/100
- **SEO Relevance Score:** {metrics.seo_relevance_score:.1f}/100

## Overall Grade
"""
        
        # Calculate overall grade
        overall_score = (metrics.coverage_score + metrics.quality_score + 
                        metrics.completeness_score + metrics.seo_relevance_score) / 4
        
        if overall_score >= 90:
            grade = "A+"
        elif overall_score >= 80:
            grade = "A"
        elif overall_score >= 70:
            grade = "B"
        elif overall_score >= 60:
            grade = "C"
        elif overall_score >= 50:
            grade = "D"
        else:
            grade = "F"
        
        report += f"**Overall Grade: {grade} ({overall_score:.1f}/100)**\n\n"
        
        # Add errors if any
        if metrics.errors:
            report += "## Errors\n"
            for error in metrics.errors:
                report += f"- {error}\n"
            report += "\n"
        
        # Add warnings if any
        if metrics.warnings:
            report += "## Warnings\n"
            for warning in metrics.warnings:
                report += f"- {warning}\n"
            report += "\n"
        
        # Add recommendations
        if metrics.recommendations:
            report += "## Recommendations\n"
            for i, rec in enumerate(metrics.recommendations, 1):
                report += f"{i}. {rec}\n"
        
        return report
