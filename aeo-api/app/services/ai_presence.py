"""
AI Presence Analysis Service
Analyzes AI bot accessibility and brand recognition
"""

import re
import requests
from urllib.parse import urljoin, urlparse
from typing import Dict, List, Tuple
try:
    from .openai_service import OpenAIService
    from .multi_ai_service import MultiAIService
except ImportError:
    try:
        from openai_service import OpenAIService
        from multi_ai_service import MultiAIService
    except ImportError:
        # Fallback for when running as standalone
        import sys
        import os
        sys.path.append(os.path.dirname(__file__))
        from openai_service import OpenAIService
        from multi_ai_service import MultiAIService  
# import extruct  # Temporarily disabled due to compatibility issues

class AIPresenceService:
    """Service for analyzing AI presence and accessibility"""
    
    def __init__(self):
        self.ai_bot_agents = [
            ('GPTBot', re.compile(r'(?i)gptbot')),
            ('Google-Extended', re.compile(r'(?i)google-extended')),
            ('ClaudeBot', re.compile(r'(?i)claudebot|anthropic-ai')),
        ]
        self.openai_service = OpenAIService()
        self.multi_ai_service = MultiAIService()
    
    def _fetch_text(self, url: str, timeout: int = 8) -> str:
        """Fetch text content from URL"""
        try:
            resp = requests.get(url, timeout=timeout)
            resp.raise_for_status()
            return resp.text or ''
        except Exception:
            return ''
    
    def _parse_robots_rules(self, robots_txt: str) -> Dict:
        """Parse robots.txt rules for AI bots"""
        checks = {}
        lines = [l.strip() for l in robots_txt.splitlines()]
        
        # Build blocks per user-agent
        blocks = []
        current_agents = []
        current_rules = []
        
        for line in lines:
            if not line or line.startswith('#'):
                continue
            if line.lower().startswith('user-agent:'):
                # flush previous
                if current_agents or current_rules:
                    blocks.append((current_agents, current_rules))
                current_agents = [line.split(':', 1)[1].strip()]
                current_rules = []
            else:
                current_rules.append(line)
        
        if current_agents or current_rules:
            blocks.append((current_agents, current_rules))

        def is_allowed_for(agent_name: str) -> bool:
            # default allow unless explicit Disallow: /
            agent_allow = True
            for agents, rules in blocks:
                # Match wildcard or exact agent
                if any(a == '*' or a.lower() == agent_name.lower() for a in agents):
                    for r in rules:
                        lower = r.lower()
                        if lower.startswith('disallow:'):
                            path = lower.split(':', 1)[1].strip()
                            if path == '/':
                                agent_allow = False
                        if lower.startswith('allow:'):
                            # seeing any allow keeps it allowed
                            pass
            return agent_allow

        for label, pattern in self.ai_bot_agents:
            checks[f'robots_{label.lower()}'] = is_allowed_for(label)

        # Sitemap
        has_sitemap = any(l.lower().startswith('sitemap:') for l in lines)
        checks['sitemap_present'] = has_sitemap
        return checks
    
    def _extract_org_and_meta(self, html: str, jsonld: list) -> Dict:
        """Extract organization schema and meta information"""
        checks = {
            'org_schema_present': False,
            'org_logo_present': False,
            'sameas_wikidata_or_wikipedia': False,
            'sameas_major_profiles_count': 0,
            'open_graph_present': False,
            'twitter_card_present': False,
        }
        
        # JSON-LD Organization
        same_as_links = []
        logo_ok = False
        
        if isinstance(jsonld, list):
            for obj in jsonld:
                if not isinstance(obj, dict):
                    continue
                t = obj.get('@type')
                if isinstance(t, list):
                    is_org = 'Organization' in t
                else:
                    is_org = t == 'Organization'
                
                if is_org:
                    checks['org_schema_present'] = True
                    same = obj.get('sameAs')
                    if isinstance(same, list):
                        same_as_links.extend([str(x) for x in same if isinstance(x, (str,))])
                    elif isinstance(same, str):
                        same_as_links.append(same)
                    
                    logo_val = obj.get('logo')
                    if isinstance(logo_val, str) and logo_val.startswith(('http://', 'https://')):
                        logo_ok = True
                    elif isinstance(logo_val, dict):
                        url_val = logo_val.get('url')
                        if isinstance(url_val, str) and url_val.startswith(('http://', 'https://')):
                            logo_ok = True
        
        checks['org_logo_present'] = logo_ok

        # sameAs evaluation
        major_domains = ['linkedin.com', 'twitter.com', 'x.com', 'youtube.com', 'crunchbase.com', 'github.com', 'facebook.com']
        major_count = 0
        for link in same_as_links:
            try:
                host = urlparse(link).hostname or ''
            except Exception:
                host = ''
            if any(d in host for d in major_domains):
                major_count += 1
            if 'wikidata.org' in host or 'wikipedia.org' in host:
                checks['sameas_wikidata_or_wikipedia'] = True
        
        checks['sameas_major_profiles_count'] = major_count

        # Simple meta detection for OG/Twitter
        lower_html = html.lower()
        checks['open_graph_present'] = ('property="og:' in lower_html) or ("property='og:" in lower_html) or ('name="og:' in lower_html)
        checks['twitter_card_present'] = ('name="twitter:' in lower_html) or ("name='twitter:" in lower_html)
        
        return checks
    
    def analyze_ai_presence(self, url: str) -> Dict:
        """Run complete AI presence audit"""
        try:
            # robots.txt
            robots_url = urljoin(url, '/robots.txt')
            robots_txt = self._fetch_text(robots_url)
            robots_checks = self._parse_robots_rules(robots_txt) if robots_txt else {f'robots_{k[0].lower()}': True for k in self.ai_bot_agents}
            
            if robots_txt and 'sitemap_present' not in robots_checks:
                robots_checks['sitemap_present'] = any(l.lower().startswith('sitemap:') for l in robots_txt.splitlines())

            # homepage html and json-ld
            html = self._fetch_text(url, timeout=10)
            jsonld = []
            
            # Basic JSON-LD extraction (replacement for extruct)
            if html:
                import json
                import re
                
                # Find all script tags with type="application/ld+json"
                script_pattern = r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>'
                matches = re.findall(script_pattern, html, re.DOTALL | re.IGNORECASE)
                
                for match in matches:
                    try:
                        # Clean the JSON content
                        json_content = match.strip()
                        if json_content:
                            parsed = json.loads(json_content)
                            if isinstance(parsed, list):
                                jsonld.extend(parsed)
                            else:
                                jsonld.append(parsed)
                    except (json.JSONDecodeError, ValueError):
                        continue
            
            content_checks = self._extract_org_and_meta(html or '', jsonld)
            
            # Multi-AI Content Understanding Analysis
            # Always do API calls if API keys exist (regardless of robots.txt)
            # But only award points for bots that are allowed in robots.txt
            ai_understanding = {}
            bot_to_provider = {
                'GPTBot': 'openai',
                'Google-Extended': 'gemini',
                'ClaudeBot': 'claude'
            }
            
            if html:
                # Extract text content for AI analysis
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(html, 'html.parser')
                text_content = soup.get_text()
                
                # Get multi-AI understanding analysis (for ALL providers with API keys)
                # This runs regardless of robots.txt status
                ai_understanding = self.multi_ai_service.analyze_content_understanding(text_content, url)
                
                # Calculate overall_score only from allowed bots (for point calculation)
                # This ensures blocked bots don't contribute to the overall AI Presence score
                allowed_provider_scores = []
                
                for label, _ in self.ai_bot_agents:
                    bot_key = label.lower()
                    is_allowed = robots_checks.get(f'robots_{bot_key}', True)
                    provider_key = bot_to_provider.get(label)
                    
                    # Only include in overall_score calculation if:
                    # 1. Bot is allowed in robots.txt
                    # 2. We have understanding data from that provider (API key exists)
                    if is_allowed and provider_key and ai_understanding.get(provider_key):
                        provider_data = ai_understanding.get(provider_key)
                        if provider_data and not provider_data.get('error'):
                            score = provider_data.get('score', 0)
                            if score > 0:  # Only count valid scores
                                allowed_provider_scores.append(score)
                
                # Calculate average from allowed bots only
                # This overall_score is used for the 20-point AI understanding category
                if allowed_provider_scores:
                    ai_understanding['overall_score'] = sum(allowed_provider_scores) // len(allowed_provider_scores)
                else:
                    # No allowed bots with valid understanding scores
                    ai_understanding['overall_score'] = 0
                
                # Note: ai_understanding still contains all provider data (even from blocked bots)
                # This allows frontend to show all understanding data, but scoring only uses allowed bots

            # Scoring
            score = 0
            
            # 30 pts robots + sitemap
            robot_points = 0
            for label, _ in self.ai_bot_agents:
                if robots_checks.get(f'robots_{label.lower()}', True):
                    robot_points += 4  # up to ~24
            if robots_checks.get('sitemap_present', False):
                robot_points += 6
            score += min(30, robot_points)

            # 40 pts organization schema + sameAs + logo
            org_points = 0
            if content_checks.get('org_schema_present'):
                org_points += 10
            if content_checks.get('org_logo_present'):
                org_points += 10
            if content_checks.get('sameas_wikidata_or_wikipedia'):
                org_points += 20
            else:
                org_points += 0
            # secondary profiles
            org_points += min(10, max(0, (content_checks.get('sameas_major_profiles_count', 0) - 1) * 5))
            score += min(40, org_points)

            # 15 pts OG/Twitter
            if content_checks.get('open_graph_present'):
                score += 8
            if content_checks.get('twitter_card_present'):
                score += 7

            # 15 pts content schemas
            content_schemas = set()
            for obj in jsonld:
                t = obj.get('@type') if isinstance(obj, dict) else None
                if isinstance(t, list):
                    content_schemas.update(t)
                elif isinstance(t, str):
                    content_schemas.add(t)
            if any(s in content_schemas for s in ('Product', 'FAQPage', 'Article', 'BlogPosting')):
                score += 15
            
            # 20 pts AI Content Understanding (Multi-AI)
            # Only count points if we have valid understanding from allowed bots
            if ai_understanding and 'overall_score' in ai_understanding and ai_understanding['overall_score'] > 0:
                ai_score = ai_understanding.get('overall_score', 0)
                score += min(20, ai_score // 5)  # Convert 0-100 to 0-20 points

            score = max(0, min(100, score))

            # Generate specific, actionable recommendations
            recs = []
            if not robots_checks.get('sitemap_present'):
                recs.append('Add Sitemap URL to robots.txt (e.g., "Sitemap: https://yoursite.com/sitemap.xml") to help AI crawlers discover all pages')
            
            blocked_bots = []
            for label, _ in self.ai_bot_agents:
                key = f'robots_{label.lower()}'
                if not robots_checks.get(key, True):
                    blocked_bots.append(label)
            if blocked_bots:
                recs.append('Allow {} in robots.txt to ensure AI crawlers can access your content'.format(' and '.join(blocked_bots)))
            
            if not content_checks.get('org_schema_present'):
                recs.append('Add Organization schema markup to your homepage to establish brand identity for AI systems')
            if not content_checks.get('org_logo_present'):
                recs.append('Provide a valid logo URL in Organization.logo property to improve visual brand recognition')
            if not content_checks.get('sameas_wikidata_or_wikipedia'):
                recs.append('Add Wikidata or Wikipedia link in Organization.sameAs property to improve entity recognition and authority')
            if content_checks.get('sameas_major_profiles_count', 0) < 2:
                current_count = content_checks.get('sameas_major_profiles_count', 0)
                recs.append('Add more social profiles (LinkedIn, Twitter, YouTube, Crunchbase, GitHub) to Organization.sameAs (currently {} of 2 recommended)'.format(current_count))
            if not content_checks.get('open_graph_present'):
                recs.append('Add Open Graph meta tags (og:title, og:description, og:image) for better social sharing and AI understanding')
            if not content_checks.get('twitter_card_present'):
                recs.append('Add Twitter Card meta tags (twitter:card, twitter:title, twitter:description) for enhanced social media presence')
            
            # Add AI understanding recommendations (filter out generic ones)
            if ai_understanding and 'recommendations' in ai_understanding:
                ai_recs = ai_understanding.get('recommendations', [])
                for ai_rec in ai_recs:
                    if ai_rec and isinstance(ai_rec, str) and len(ai_rec) > 15:
                        # Filter out generic recommendations
                        if not any(word in ai_rec.lower() for word in ['retry', 'error', 'failed', 'check', 'configure']):
                            recs.append(ai_rec)

            explanation_bits = []
            explanation_bits.append('Robots allow major AI bots' if all(robots_checks.get(f'robots_{label.lower()}', True) for label, _ in self.ai_bot_agents) else 'Some AI bots are blocked in robots.txt')
            explanation_bits.append('Sitemap present' if robots_checks.get('sitemap_present') else 'Sitemap missing in robots.txt')
            explanation_bits.append('Organization schema detected' if content_checks.get('org_schema_present') else 'Organization schema missing')
            explanation_bits.append('Wikidata/Wikipedia present in sameAs' if content_checks.get('sameas_wikidata_or_wikipedia') else 'Wikidata/Wikipedia missing in sameAs')
            explanation_bits.append('OG/Twitter tags present' if (content_checks.get('open_graph_present') and content_checks.get('twitter_card_present')) else 'OG/Twitter tags incomplete')
            
            # Add AI understanding explanation
            if ai_understanding and 'understanding_level' in ai_understanding:
                explanation_bits.append(f'AI understanding: {ai_understanding["understanding_level"]}')

            # Calculate individual bot scores for frontend
            platforms = {}
            for label, _ in self.ai_bot_agents:
                bot_key = label.lower()
                is_allowed = robots_checks.get(f'robots_{bot_key}', True)
                
                # If bot is not allowed, score is 0
                if not is_allowed:
                    platforms[label] = {
                        'score': 0,
                        'status': 'OFFLINE',
                        'allowed': False,
                        'details': {
                            'robots_allowed': False,
                            'org_schema': False,
                            'sitemap': False,
                            'og_tags': False
                        }
                    }
                else:
                    # Calculate bot accessibility score (based on robots.txt allowance + technical setup)
                    bot_score = 20  # Base score for being allowed
                    if content_checks.get('org_schema_present'):
                        bot_score += 15  # Organization schema helps
                    if content_checks.get('sitemap_present'):
                        bot_score += 10  # Sitemap helps
                    if content_checks.get('open_graph_present'):
                        bot_score += 5   # OG tags helps
                    
                    # Get AI understanding data for this bot (if API key exists)
                    provider_key = bot_to_provider.get(label)
                    understanding_data = None
                    understanding_score = None
                    
                    if provider_key and ai_understanding and ai_understanding.get(provider_key):
                        provider_data = ai_understanding.get(provider_key)
                        if provider_data and not provider_data.get('error'):
                            understanding_data = provider_data
                            understanding_score = provider_data.get('score', 0)
                    
                    # Determine display score:
                    # Priority: AI Understanding Score > Bot Accessibility Score
                    # Only show AI understanding if bot is allowed AND we have understanding data
                    if understanding_score is not None:
                        display_score = understanding_score
                        score_type = 'ai_understanding'
                    else:
                        display_score = bot_score
                        score_type = 'bot_accessibility'
                    
                    # Build platform details
                    platform_details = {
                        'robots_allowed': True,
                        'org_schema': content_checks.get('org_schema_present', False),
                        'sitemap': robots_checks.get('sitemap_present', False),
                        'og_tags': content_checks.get('open_graph_present', False),
                        'bot_accessibility_score': bot_score,
                        'score_type': score_type,
                        'ai_understanding_available': understanding_data is not None
                    }
                    
                    # Add AI understanding details if available
                    if understanding_data:
                        platform_details.update({
                            'ai_understanding_score': understanding_score,
                            'understanding_level': understanding_data.get('understanding_level'),
                            'clarity_score': understanding_data.get('clarity_score'),
                            'key_topics': understanding_data.get('key_topics', []),
                            'main_issues': understanding_data.get('main_issues', []),
                            'recommendations': understanding_data.get('recommendations', [])
                        })
                    
                    platforms[label] = {
                        'score': display_score,
                        'status': 'LIVE',
                        'allowed': True,
                        'details': platform_details
                    }

            return {
                'score': score,
                'explanation': '; '.join(explanation_bits),
                'checks': {**robots_checks, **content_checks},
                'recommendations': recs,
                'ai_understanding': ai_understanding,  # NEW: Include AI analysis results
                'platforms': platforms  # NEW: Individual bot scores for frontend
            }
        except Exception as e:
            return {
                'score': 0,
                'explanation': f'AI Presence audit failed: {str(e)}',
                'checks': {},
                'recommendations': ['Retry later']
            }
