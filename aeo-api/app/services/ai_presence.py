"""
AI Presence Analysis Service
Analyzes AI bot accessibility and brand recognition
"""

import re
import requests
from urllib.parse import urljoin, urlparse
from typing import Dict, List, Tuple
# import extruct  # Temporarily disabled due to compatibility issues

class AIPresenceService:
    """Service for analyzing AI presence and accessibility"""
    
    def __init__(self):
        self.ai_bot_agents = [
            ('GPTBot', re.compile(r'(?i)gptbot')),
            ('Google-Extended', re.compile(r'(?i)google-extended')),
            ('ClaudeBot', re.compile(r'(?i)claudebot|anthropic-ai')),
            ('PerplexityBot', re.compile(r'(?i)perplexitybot')),
            ('CCBot', re.compile(r'(?i)ccbot')),
            ('bingbot', re.compile(r'(?i)bingbot')),
        ]
    
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
            # Temporarily disabled extruct due to compatibility issues
            # try:
            #     if html:
            #         jsonld = extruct.extract(html, base_url=url).get('json-ld') or []
            # except Exception:
            #     jsonld = []
            
            content_checks = self._extract_org_and_meta(html or '', jsonld)

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

            score = max(0, min(100, score))

            # Generate recommendations
            recs = []
            if not robots_checks.get('sitemap_present'):
                recs.append('Add Sitemap line to robots.txt')
            for label, _ in self.ai_bot_agents:
                key = f'robots_{label.lower()}'
                if not robots_checks.get(key, True):
                    recs.append(f'Allow {label} in robots.txt')
            if not content_checks.get('org_schema_present'):
                recs.append('Add Organization schema on the homepage')
            if not content_checks.get('org_logo_present'):
                recs.append('Provide a valid logo URL in Organization.logo')
            if not content_checks.get('sameas_wikidata_or_wikipedia'):
                recs.append('Add Wikidata or Wikipedia link in Organization.sameAs')
            if content_checks.get('sameas_major_profiles_count', 0) < 2:
                recs.append('Add LinkedIn/Twitter/YouTube/Crunchbase/GitHub links in Organization.sameAs')
            if not content_checks.get('open_graph_present'):
                recs.append('Add Open Graph meta tags')
            if not content_checks.get('twitter_card_present'):
                recs.append('Add Twitter Card meta tags')

            explanation_bits = []
            explanation_bits.append('Robots allow major AI bots' if all(robots_checks.get(f'robots_{label.lower()}', True) for label, _ in self.ai_bot_agents) else 'Some AI bots are blocked in robots.txt')
            explanation_bits.append('Sitemap present' if robots_checks.get('sitemap_present') else 'Sitemap missing in robots.txt')
            explanation_bits.append('Organization schema detected' if content_checks.get('org_schema_present') else 'Organization schema missing')
            explanation_bits.append('Wikidata/Wikipedia present in sameAs' if content_checks.get('sameas_wikidata_or_wikipedia') else 'Wikidata/Wikipedia missing in sameAs')
            explanation_bits.append('OG/Twitter tags present' if (content_checks.get('open_graph_present') and content_checks.get('twitter_card_present')) else 'OG/Twitter tags incomplete')

            return {
                'score': score,
                'explanation': '; '.join(explanation_bits),
                'checks': {**robots_checks, **content_checks},
                'recommendations': recs
            }
        except Exception as e:
            return {
                'score': 0,
                'explanation': f'AI Presence audit failed: {str(e)}',
                'checks': {},
                'recommendations': ['Retry later']
            }
