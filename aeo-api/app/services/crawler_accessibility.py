"""
Crawler Accessibility Analysis Service
Analyzes content accessibility for web crawlers
"""

import re
from typing import Dict, List
from bs4 import BeautifulSoup

class CrawlerAccessibilityService:
    """Service for analyzing crawler accessibility"""
    
    def __init__(self):
        self.crawler_indicators = [
            'robots.txt',
            'sitemap.xml',
            'meta robots',
            'canonical',
            'structured data',
            'alt text',
            'title tag',
            'meta description'
        ]
    
    def _analyze_robots_meta(self, html_content: str) -> Dict[str, any]:
        """Analyze robots meta tags"""
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Find robots meta tag
            robots_meta = soup.find('meta', attrs={'name': 'robots'})
            
            if robots_meta:
                content = robots_meta.get('content', '').lower()
                return {
                    'has_robots_meta': True,
                    'content': content,
                    'allows_indexing': 'noindex' not in content,
                    'allows_following': 'nofollow' not in content,
                    'allows_archive': 'noarchive' not in content
                }
            else:
                return {
                    'has_robots_meta': False,
                    'content': '',
                    'allows_indexing': True,  # Default to allowing
                    'allows_following': True,
                    'allows_archive': True
                }
        except Exception:
            return {
                'has_robots_meta': False,
                'content': '',
                'allows_indexing': True,
                'allows_following': True,
                'allows_archive': True
            }
    
    def _analyze_meta_tags(self, html_content: str) -> Dict[str, any]:
        """Analyze important meta tags for crawlers"""
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Title tag
            title_tag = soup.find('title')
            title = title_tag.get_text().strip() if title_tag else ''
            
            # Meta description
            description_meta = soup.find('meta', attrs={'name': 'description'})
            description = description_meta.get('content', '').strip() if description_meta else ''
            
            # Canonical URL
            canonical_link = soup.find('link', attrs={'rel': 'canonical'})
            canonical = canonical_link.get('href', '') if canonical_link else ''
            
            # Open Graph tags
            og_title = soup.find('meta', attrs={'property': 'og:title'})
            og_description = soup.find('meta', attrs={'property': 'og:description'})
            og_url = soup.find('meta', attrs={'property': 'og:url'})
            
            return {
                'title': title,
                'title_length': len(title),
                'has_title': len(title) > 0,
                'description': description,
                'description_length': len(description),
                'has_description': len(description) > 0,
                'canonical': canonical,
                'has_canonical': len(canonical) > 0,
                'og_title': og_title.get('content', '') if og_title else '',
                'og_description': og_description.get('content', '') if og_description else '',
                'og_url': og_url.get('content', '') if og_url else '',
                'has_og_tags': any([og_title, og_description, og_url])
            }
        except Exception:
            return {
                'title': '',
                'title_length': 0,
                'has_title': False,
                'description': '',
                'description_length': 0,
                'has_description': False,
                'canonical': '',
                'has_canonical': False,
                'og_title': '',
                'og_description': '',
                'og_url': '',
                'has_og_tags': False
            }
    
    def _analyze_images(self, html_content: str) -> Dict[str, any]:
        """Analyze image accessibility for crawlers"""
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            images = soup.find_all('img')
            
            total_images = len(images)
            images_with_alt = 0
            images_with_title = 0
            images_with_both = 0
            
            for img in images:
                has_alt = bool(img.get('alt', '').strip())
                has_title = bool(img.get('title', '').strip())
                
                if has_alt:
                    images_with_alt += 1
                if has_title:
                    images_with_title += 1
                if has_alt and has_title:
                    images_with_both += 1
            
            return {
                'total_images': total_images,
                'images_with_alt': images_with_alt,
                'images_with_title': images_with_title,
                'images_with_both': images_with_both,
                'alt_text_coverage': images_with_alt / total_images if total_images > 0 else 0,
                'title_coverage': images_with_title / total_images if total_images > 0 else 0
            }
        except Exception:
            return {
                'total_images': 0,
                'images_with_alt': 0,
                'images_with_title': 0,
                'images_with_both': 0,
                'alt_text_coverage': 0,
                'title_coverage': 0
            }
    
    def _analyze_links(self, html_content: str) -> Dict[str, any]:
        """Analyze link structure for crawlers"""
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            links = soup.find_all('a', href=True)
            
            total_links = len(links)
            internal_links = 0
            external_links = 0
            links_with_text = 0
            links_with_title = 0
            
            for link in links:
                href = link.get('href', '')
                text = link.get_text().strip()
                title = link.get('title', '')
                
                if href.startswith('http'):
                    external_links += 1
                else:
                    internal_links += 1
                
                if text:
                    links_with_text += 1
                if title:
                    links_with_title += 1
            
            return {
                'total_links': total_links,
                'internal_links': internal_links,
                'external_links': external_links,
                'links_with_text': links_with_text,
                'links_with_title': links_with_title,
                'text_coverage': links_with_text / total_links if total_links > 0 else 0,
                'title_coverage': links_with_title / total_links if total_links > 0 else 0
            }
        except Exception:
            return {
                'total_links': 0,
                'internal_links': 0,
                'external_links': 0,
                'links_with_text': 0,
                'links_with_title': 0,
                'text_coverage': 0,
                'title_coverage': 0
            }
    
    def _calculate_accessibility_score(self, robots_meta: Dict, meta_tags: Dict, images: Dict, links: Dict) -> int:
        """Calculate overall crawler accessibility score"""
        score = 0
        
        # Robots meta (0-20 points)
        if robots_meta['allows_indexing']:
            score += 10
        if robots_meta['allows_following']:
            score += 10
        
        # Meta tags (0-30 points)
        if meta_tags['has_title'] and 10 <= meta_tags['title_length'] <= 60:
            score += 15
        if meta_tags['has_description'] and 120 <= meta_tags['description_length'] <= 160:
            score += 15
        
        # Images (0-25 points)
        if images['total_images'] > 0:
            alt_score = int(25 * images['alt_text_coverage'])
            score += alt_score
        
        # Links (0-25 points)
        if links['total_links'] > 0:
            link_score = int(25 * links['text_coverage'])
            score += link_score
        
        return min(100, score)
    
    def analyze_crawler_accessibility(self, url: str, html_content: str) -> Dict:
        """Analyze crawler accessibility"""
        try:
            # Analyze different aspects
            robots_meta = self._analyze_robots_meta(html_content)
            meta_tags = self._analyze_meta_tags(html_content)
            images = self._analyze_images(html_content)
            links = self._analyze_links(html_content)
            
            # Calculate overall score
            score = self._calculate_accessibility_score(robots_meta, meta_tags, images, links)
            
            # Generate specific, actionable recommendations
            recommendations = []
            
            if not robots_meta['allows_indexing']:
                recommendations.append('Allow indexing in robots meta tag to ensure search engines and AI crawlers can index your content')
            if not meta_tags['has_title']:
                recommendations.append('Add a descriptive title tag (50-60 characters) to improve search visibility and AI understanding')
            if not meta_tags['has_description']:
                recommendations.append('Add a meta description (150-160 characters) to provide context for search engines and AI systems')
            if images['total_images'] > 0 and images['alt_text_coverage'] < 0.8:
                missing_alt_pct = (1 - images['alt_text_coverage']) * 100
                recommendations.append('Add descriptive alt text to {:.0f}% of images to improve accessibility and AI image understanding'.format(missing_alt_pct))
            if links['total_links'] > 0 and links['text_coverage'] < 0.8:
                missing_text_pct = (1 - links['text_coverage']) * 100
                recommendations.append('Add descriptive anchor text to {:.0f}% of links to improve link context for AI crawlers'.format(missing_text_pct))
            if not meta_tags['has_canonical']:
                recommendations.append('Add canonical URL tag to prevent duplicate content issues and improve SEO clarity')
            
            return {
                'score': score,
                'robots_meta': robots_meta,
                'meta_tags': meta_tags,
                'images': images,
                'links': links,
                'recommendations': recommendations
            }
            
        except Exception as e:
            return {
                'score': 0,
                'error': f'Crawler accessibility analysis failed: {str(e)}',
                'robots_meta': {},
                'meta_tags': {},
                'images': {},
                'links': {},
                'recommendations': ['Retry analysis']
            }
