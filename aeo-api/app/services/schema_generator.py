"""
Schema.org Markup Generator Service
Uses OpenAI GPT to generate appropriate schema markup for web pages
"""

import os
import json
import logging
from typing import Dict, Any, Optional
from bs4 import BeautifulSoup

try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    logging.warning("OpenAI not available for schema generation")


class SchemaGenerator:
    """Generate Schema.org markup using AI analysis"""
    
    def __init__(self):
        self.api_key = os.getenv('OPENAI_API_KEY')
        self.client = None
        
        if OPENAI_AVAILABLE and self.api_key:
            try:
                self.client = OpenAI(api_key=self.api_key)
                logging.info("Schema Generator initialized with OpenAI")
            except Exception as e:
                logging.error(f"Failed to initialize OpenAI client: {e}")
    
    def extract_page_content(self, html: str, url: str) -> Dict[str, Any]:
        """Extract relevant content from HTML for schema generation"""
        try:
            soup = BeautifulSoup(html, 'html.parser')
            
            # Extract basic information
            title = soup.find('title')
            title_text = title.get_text().strip() if title else ''
            
            # Meta tags
            meta_desc = soup.find('meta', attrs={'name': 'description'})
            description = meta_desc.get('content', '').strip() if meta_desc else ''
            
            og_title = soup.find('meta', property='og:title')
            og_description = soup.find('meta', property='og:description')
            og_image = soup.find('meta', property='og:image')
            
            # Headings
            h1_tags = [h.get_text().strip() for h in soup.find_all('h1')]
            h2_tags = [h.get_text().strip() for h in soup.find_all('h2')[:10]]  # First 10 H2s for services
            h3_tags = [h.get_text().strip() for h in soup.find_all('h3')[:10]]  # First 10 H3s
            
            # Images (including logo detection)
            images = []
            logo_img = None
            for img in soup.find_all('img')[:10]:
                src = img.get('src', '')
                alt = img.get('alt', '').lower()
                if src:
                    images.append({'src': src, 'alt': img.get('alt', '')})
                    # Detect logo
                    if 'logo' in alt or 'logo' in src.lower():
                        logo_img = src
            
            # Social media links
            social_links = []
            for link in soup.find_all('a', href=True):
                href = link.get('href', '')
                if any(domain in href for domain in ['facebook.com', 'twitter.com', 'linkedin.com', 'instagram.com', 'youtube.com', 'pinterest.com']):
                    social_links.append(href)
            
            # Article/Blog indicators
            article_tag = soup.find('article')
            time_tag = soup.find('time')
            author_meta = soup.find('meta', attrs={'name': 'author'})
            
            # Date published/modified
            date_published = time_tag.get('datetime', '') if time_tag else ''
            
            # Business indicators
            address_tag = soup.find('address')
            phone_links = [a.get('href', '').replace('tel:', '') for a in soup.find_all('a', href=lambda x: x and 'tel:' in x)]
            email_links = [a.get('href', '').replace('mailto:', '') for a in soup.find_all('a', href=lambda x: x and 'mailto:' in x)]
            
            # Product indicators
            price_elements = soup.find_all(class_=lambda x: x and ('price' in x.lower() if isinstance(x, str) else False))
            
            # Services detection (from H2/H3 tags and lists)
            services = []
            # Check for service keywords in headings
            service_keywords = ['service', 'solution', 'offering', 'product', 'feature']
            for h2 in h2_tags + h3_tags:
                if any(keyword in h2.lower() for keyword in service_keywords):
                    services.append(h2)
            
            # Extract company name from title or H1
            company_name = ''
            if title_text:
                # Try to extract company name (usually before | or - in title)
                parts = title_text.split('|')[0].split('-')[0].strip()
                company_name = parts
            
            # Extract some body text (first 800 chars for better context)
            body_text = ''
            body = soup.find('body')
            if body:
                # Remove script and style elements
                for script in body(['script', 'style', 'nav', 'header', 'footer']):
                    script.decompose()
                body_text = body.get_text(separator=' ', strip=True)[:800]
            
            return {
                'url': url,
                'title': title_text,
                'description': description,
                'og_title': og_title.get('content', '') if og_title else '',
                'og_description': og_description.get('content', '') if og_description else '',
                'og_image': og_image.get('content', '') if og_image else '',
                'company_name': company_name,
                'h1_tags': h1_tags,
                'h2_tags': h2_tags,
                'h3_tags': h3_tags,
                'images': images,
                'logo': logo_img or (images[0]['src'] if images else ''),
                'social_links': list(set(social_links))[:10],  # Unique social links
                'has_article': bool(article_tag),
                'has_time': bool(time_tag),
                'has_author': bool(author_meta),
                'has_address': bool(address_tag),
                'has_phone': len(phone_links) > 0,
                'has_email': len(email_links) > 0,
                'has_price': len(price_elements) > 0,
                'body_preview': body_text,
                'author': author_meta.get('content', '') if author_meta else '',
                'date_published': date_published,
                'phone_numbers': phone_links[:3],
                'email_addresses': email_links[:3],
                'detected_services': services[:10]
            }
        except Exception as e:
            logging.error(f"Error extracting page content: {e}")
            return {'url': url, 'error': str(e)}
    
    def generate_schema_with_ai(self, page_content: Dict[str, Any]) -> Dict[str, Any]:
        """Use OpenAI to generate appropriate schema markup"""
        
        if not self.client:
            return {
                'error': 'OpenAI API not configured',
                'message': 'Please set OPENAI_API_KEY in your .env file',
                'schema': None
            }
        
        try:
            # Create prompt for GPT
            prompt = f"""You are a Schema.org markup expert. Analyze this web page content and generate COMPREHENSIVE, DETAILED Schema.org JSON-LD markup with ALL relevant properties.

Page Information:
- URL: {page_content.get('url', '')}
- Company Name: {page_content.get('company_name', '')}
- Title: {page_content.get('title', '')}
- Description: {page_content.get('description', '')}
- H1 Tags: {', '.join(page_content.get('h1_tags', []))}
- H2 Tags (Services/Features): {', '.join(page_content.get('h2_tags', []))}
- H3 Tags: {', '.join(page_content.get('h3_tags', [])[:5])}
- Logo URL: {page_content.get('logo', '')}
- Social Media Links: {', '.join(page_content.get('social_links', []))}
- Phone Numbers: {', '.join(page_content.get('phone_numbers', []))}
- Email Addresses: {', '.join(page_content.get('email_addresses', []))}
- Detected Services: {', '.join(page_content.get('detected_services', []))}
- Has Article Content: {page_content.get('has_article', False)}
- Has Author Info: {page_content.get('has_author', False)}
- Author: {page_content.get('author', '')}
- Date Published: {page_content.get('date_published', '')}
- Has Business Info: {page_content.get('has_address', False) or page_content.get('has_phone', False) or page_content.get('has_email', False)}
- Has Product/Price Info: {page_content.get('has_price', False)}
- Content Preview: {page_content.get('body_preview', '')[:400]}

Instructions - FOLLOW EXACTLY:

For ORGANIZATION/BUSINESS schemas, you MUST include ALL of these properties:

1. Basic Information (MANDATORY):
   - "@context": "https://schema.org"
   - "@type": "Organization" (or LocalBusiness, Corporation, etc.)
   - "name": Use company name from page
   - "url": Use the actual URL provided
   - "logo": Use extracted logo URL
   - "alternateName": Use short brand name
   - "description": Use full description from page

2. Company Details (MANDATORY - include even if not found):
   - "foundingDate": Use "2014" or reasonable year
   - "founders": Array with {{"@type": "Person", "name": "Founder Name"}}

3. Address (MANDATORY - always include complete object):
   - "address": {{
       "@type": "PostalAddress",
       "streetAddress": "Office Street Address",
       "addressLocality": "City",
       "addressRegion": "State",
       "postalCode": "PIN/ZIP",
       "addressCountry": "IN" or "US"
     }}

4. Contact (MANDATORY - always include):
   - "contactPoint": {{
       "@type": "ContactPoint",
       "telephone": "+91-XXXXXXXXXX" or extracted phone,
       "contactType": "customer service",
       "areaServed": "IN" or "US",
       "availableLanguage": ["English"]
     }}

5. Social Media (MANDATORY):
   - "sameAs": Array of ALL social links found (Facebook, LinkedIn, Twitter, Instagram, etc.)

6. Services (MANDATORY - create 5-10 detailed services):
   - "service": Array of Service objects based on H2/H3 tags
   - Each service: {{"@type": "Service", "name": "Service Name", "description": "Detailed description"}}
   - Example services: SEO, Content Marketing, Social Media Marketing, PPC, Email Marketing, etc.

7. Brand (MANDATORY):
   - "brand": {{"@type": "Brand", "name": "Brand Name", "url": "URL"}}

CRITICAL RULES:
- Use REAL data where available (social links, logo, company name, description)
- For missing data, use professional placeholder format (NOT "PLACEHOLDER" text)
- ALWAYS include all mandatory properties listed above
- Create detailed service array from H2/H3 headings (minimum 5 services)
- Make it look like enterprise-level schema markup

For ARTICLE schemas:
- Include full author schema, publisher schema, images, dates
- Use nested Person and Organization objects

For PRODUCT schemas:
- Include offers, price, availability, brand, reviews

Return ONLY valid JSON-LD markup, no explanations or markdown code blocks."""

            # Call OpenAI API
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",  # Using gpt-4o-mini for cost efficiency
                messages=[
                    {
                        "role": "system",
                        "content": "You are a Schema.org expert that generates COMPREHENSIVE, DETAILED, valid JSON-LD markup for enterprise-level SEO. For Organization schemas, you MUST include ALL mandatory properties: name, url, logo, alternateName, description, foundingDate (use reasonable year like '2014'), founders array with Person objects, complete address object with PostalAddress schema, contactPoint object with telephone and details, sameAs array with social links, service array with 5-10 detailed Service objects, and brand object. Use real data where available, and use professional placeholder text for missing data (like 'Office Street Address', '+91-XXXXXXXXXX', etc). Make it look exactly like enterprise schemas. Return valid JSON only, no markdown."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.3,  # Lower temperature for more consistent output
                max_tokens=3000  # Increased for more detailed schemas
            )
            
            # Extract the generated schema
            schema_text = response.choices[0].message.content.strip()
            
            # Clean up markdown code blocks if present
            if schema_text.startswith('```'):
                lines = schema_text.split('\n')
                schema_text = '\n'.join(lines[1:-1]) if len(lines) > 2 else schema_text
                schema_text = schema_text.replace('```json', '').replace('```', '').strip()
            
            # Parse to validate JSON
            schema_json = json.loads(schema_text)
            
            # Determine schema type(s)
            schema_types = []
            if isinstance(schema_json, dict):
                if '@type' in schema_json:
                    schema_type = schema_json['@type']
                    if isinstance(schema_type, list):
                        schema_types = schema_type
                    else:
                        schema_types = [schema_type]
            
            # Generate RDFa markup
            rdfa_markup = self.convert_to_rdfa(schema_json)
            
            return {
                'success': True,
                'schema': schema_json,
                'schema_text': json.dumps(schema_json, indent=2),
                'rdfa_markup': rdfa_markup,
                'schema_types': schema_types,
                'model_used': 'gpt-4o-mini',
                'tokens_used': response.usage.total_tokens if hasattr(response, 'usage') else 0
            }
            
        except json.JSONDecodeError as e:
            logging.error(f"Failed to parse generated schema as JSON: {e}")
            return {
                'error': 'Invalid JSON generated',
                'message': f'The AI generated invalid JSON: {str(e)}',
                'raw_output': schema_text if 'schema_text' in locals() else None,
                'schema': None
            }
        except Exception as e:
            logging.error(f"Error generating schema with AI: {e}")
            return {
                'error': 'Schema generation failed',
                'message': str(e),
                'schema': None
            }
    
    def convert_to_rdfa(self, schema_json: Dict[str, Any]) -> str:
        """Convert JSON-LD schema to RDFa markup"""
        
        def json_to_rdfa(data, indent=0, parent_prop=None):
            """Recursively convert JSON schema to RDFa HTML"""
            spacing = "  " * indent
            rdfa_html = []
            
            if isinstance(data, dict):
                # Get schema type
                schema_type = data.get('@type', '')
                vocab = data.get('@context', 'https://schema.org')
                
                # Start div with vocab and typeof
                if indent == 0:
                    rdfa_html.append(f'{spacing}<div vocab="{vocab}" typeof="{schema_type}">')
                elif schema_type:
                    rdfa_html.append(f'{spacing}<div typeof="{schema_type}">')
                else:
                    rdfa_html.append(f'{spacing}<div>')
                
                # Process each property
                for key, value in data.items():
                    if key in ['@context', '@type']:
                        continue
                    
                    if isinstance(value, dict):
                        # Nested object
                        rdfa_html.append(f'{spacing}  <div property="{key}">')
                        rdfa_html.extend(json_to_rdfa(value, indent + 2))
                        rdfa_html.append(f'{spacing}  </div>')
                    elif isinstance(value, list):
                        # Array of items
                        for item in value:
                            if isinstance(item, dict):
                                rdfa_html.append(f'{spacing}  <div property="{key}">')
                                rdfa_html.extend(json_to_rdfa(item, indent + 2))
                                rdfa_html.append(f'{spacing}  </div>')
                            else:
                                rdfa_html.append(f'{spacing}  <span property="{key}" content="{item}"></span>')
                    else:
                        # Simple value
                        rdfa_html.append(f'{spacing}  <span property="{key}" content="{value}"></span>')
                
                rdfa_html.append(f'{spacing}</div>')
            
            return rdfa_html
        
        try:
            rdfa_lines = json_to_rdfa(schema_json)
            return '\n'.join(rdfa_lines)
        except Exception as e:
            logging.error(f"Error converting to RDFa: {e}")
            return f"<!-- Error converting to RDFa: {str(e)} -->"
    
    def generate_fallback_schema(self, page_content: Dict[str, Any]) -> Dict[str, Any]:
        """Generate basic schema without AI as fallback"""
        
        url = page_content.get('url', '')
        title = page_content.get('title', '')
        description = page_content.get('description', '')
        
        # Determine basic type
        if page_content.get('has_article') or page_content.get('has_author'):
            schema_type = 'Article'
        elif page_content.get('has_address') or page_content.get('has_phone'):
            schema_type = 'LocalBusiness'
        elif page_content.get('has_price'):
            schema_type = 'Product'
        else:
            schema_type = 'WebPage'
        
        # Build basic schema
        schema = {
            "@context": "https://schema.org",
            "@type": schema_type,
            "url": url
        }
        
        if title:
            schema["name"] = title
            schema["headline"] = title
        
        if description:
            schema["description"] = description
        
        # Add images if available
        images = page_content.get('images', [])
        if images:
            schema["image"] = [img['src'] for img in images if img.get('src')]
        
        # Generate RDFa markup
        rdfa_markup = self.convert_to_rdfa(schema)
        
        return {
            'success': True,
            'schema': schema,
            'schema_text': json.dumps(schema, indent=2),
            'rdfa_markup': rdfa_markup,
            'schema_types': [schema_type],
            'fallback': True,
            'message': 'Generated basic schema (OpenAI not available)'
        }
    
    def generate_schema(self, html: str, url: str) -> Dict[str, Any]:
        """Main method to generate schema markup for a page"""
        
        try:
            # Extract page content
            page_content = self.extract_page_content(html, url)
            
            if 'error' in page_content:
                return {
                    'success': False,
                    'error': 'Content extraction failed',
                    'message': page_content['error']
                }
            
            # Try AI generation first
            if self.client:
                result = self.generate_schema_with_ai(page_content)
                if result.get('success'):
                    return result
                else:
                    # AI failed, use fallback
                    logging.warning(f"AI schema generation failed: {result.get('message')}, using fallback")
                    return self.generate_fallback_schema(page_content)
            else:
                # No AI available, use fallback
                return self.generate_fallback_schema(page_content)
                
        except Exception as e:
            logging.error(f"Schema generation error: {e}")
            return {
                'success': False,
                'error': 'Schema generation failed',
                'message': str(e)
            }
    
    def validate_schema(self, schema_json: Dict[str, Any]) -> Dict[str, Any]:
        """Validate schema markup"""
        
        issues = []
        warnings = []
        
        # Check required fields
        if '@context' not in schema_json:
            issues.append("Missing @context property")
        elif schema_json['@context'] != 'https://schema.org':
            warnings.append("@context should be 'https://schema.org'")
        
        if '@type' not in schema_json:
            issues.append("Missing @type property")
        
        # Check for common properties
        if 'name' not in schema_json and 'headline' not in schema_json:
            warnings.append("Consider adding 'name' or 'headline' property")
        
        if 'description' not in schema_json:
            warnings.append("Consider adding 'description' property")
        
        return {
            'valid': len(issues) == 0,
            'issues': issues,
            'warnings': warnings
        }

