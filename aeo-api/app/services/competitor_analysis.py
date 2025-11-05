"""
Competitor Landscape Analysis Service using DataForSEO API
Analyzes competitor backlinks and domain authority
"""

import traceback
from typing import List, Dict, Any, Tuple, Optional
from collections import Counter
from .dataforseo_client import DataForSEOClient


class CompetitorAnalysisService:
    """
    Service for analyzing competitor landscape based on backlinks data from DataForSEO API
    """
    
    def __init__(self, username: Optional[str] = None, password: Optional[str] = None):
        """
        Initialize the competitor analysis service
        
        Args:
            username: DataForSEO API username (optional, defaults to env var)
            password: DataForSEO API password (optional, defaults to env var)
        """
        try:
            self.client = DataForSEOClient(username, password)
            self.api_available = True
        except ValueError as e:
            print(f"WARNING: DataForSEO API not configured: {e}")
            self.api_available = False
    
    def fetch_backlinks_data(self, target_domain: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Fetch backlinks data for a target domain using DataForSEO API
        
        IMPORTANT: This endpoint returns REFERRING DOMAINS, not individual backlinks.
        Each referring domain may have multiple backlinks to the target domain.
        
        Logic:
        - If total referring domains <= 100: Use ALL available data
        - If total referring domains > 100: Use only TOP 100 (sorted by rank)
        
        Args:
            target_domain: The domain to analyze (e.g., 'example.com')
            limit: Optional override for custom limit (default: automatic 100 max)
            
        Returns:
            List of referring domains data dictionaries
        """
        if not self.api_available:
            print("WARNING: DataForSEO API not available")
            return []
        
        # If custom limit is provided, use it; otherwise use automatic logic
        if limit is not None:
            max_limit = limit
            initial_fetch_limit = limit
        else:
            # Automatic logic: max 100, but use all if <= 100
            max_limit = 100
            initial_fetch_limit = 100
        
        # Prepare base post data
        post_data = [{
            'target': target_domain,
            'limit': initial_fetch_limit,
            'order_by': ['rank,desc'],  # Sort by rank in descending order (best domains first)
            'exclude_internal_backlinks': True,  # Exclude internal backlinks
            'backlinks_filters': ['dofollow', '=', True],  # Filter for dofollow backlinks
            'filters': ['backlinks', '>', 1]  # Filter for domains with backlinks
        }]
        
        try:
            response = self.client.post('/v3/backlinks/referring_domains/live', post_data)
            
            # Check for API errors
            if 'tasks' in response and len(response['tasks']) > 0:
                task = response['tasks'][0]
                
                # Check for error in task
                if 'status_code' in task and task['status_code'] != 20000:
                    error_msg = task.get('status_message', 'Unknown API error')
                    print(f'WARNING: API Error: {error_msg} (Code: {task.get("status_code")})')
                    return []
                
                task_result = task.get('result', [])
                if task_result:
                    result_data = task_result[0]
                    items = result_data.get('items', [])
                    total_count = result_data.get('total_count', len(items))
                    
                    # If no items but we have total_count, it might be filtered out
                    if len(items) == 0 and total_count == 0:
                        print(f'INFO: No referring domains found (filters may be too restrictive)')
                        return []
                    
                    # Apply the logic: <= max_limit use all, > max_limit use top max_limit
                    if limit is None and total_count <= max_limit:
                        # Automatic mode: If total is <= 100, fetch all
                        if len(items) < total_count:
                            # Need to fetch all available data
                            post_data[0]['limit'] = total_count
                            response = self.client.post('/v3/backlinks/referring_domains/live', post_data)
                            if 'tasks' in response and len(response['tasks']) > 0:
                                task = response['tasks'][0]
                                task_result = task.get('result', [])
                                if task_result:
                                    items = task_result[0].get('items', [])
                        
                        print(f"SUCCESS: Using all available data: {len(items)} referring domains")
                        return items
                    else:
                        # Automatic mode (> 100) or custom limit
                        if limit is None:
                            print(f"INFO: Total referring domains: {total_count}")
                            print(f"SUCCESS: Using top {max_limit} referring domains (sorted by rank)")
                        else:
                            print(f"INFO: Total referring domains: {total_count}")
                            print(f"SUCCESS: Using top {max_limit} referring domains (custom limit)")
                        return items
                else:
                    print(f'INFO: No result data in API response')
                    return []
            else:
                print(f'WARNING: Invalid API response structure')
                return []
            
        except Exception as e:
            print(f'ERROR: Error fetching backlinks data: {e}')
            traceback.print_exc()
            return []
    
    def calculate_metrics(self, backlinks: List[Dict[str, Any]]) -> Dict[str, float]:
        """
        Calculate all metrics needed for the Competitor Landscape Score
        
        Args:
            backlinks: List of backlinks data from DataForSEO API
            
        Returns:
            Dictionary containing all calculated metrics
        """
        if not backlinks:
            return {
                'total_referring_domains': 0,
                'dofollow_backlinks': 0,
                'domain_quality': 0,
                'diversity_score': 0,
                'spam_score': 0,
                'normalized_metrics': {}
            }
        
        # Initialize counters
        total_referring_domains = 0
        total_dofollow = 0
        total_quality = 0
        total_spam = 0
        tlds = set()
        countries = set()
        platforms = set()
        
        for item in backlinks:
            # Extract key metrics from each backlink item
            ref_domains = item.get("referring_domains", 0)
            nofollow = item.get("referring_domains_nofollow", 0)
            spam = item.get("backlinks_spam_score", 0)
            rank = item.get("rank", 50)  # Default rank if not provided
            
            # Accumulate totals
            total_referring_domains += ref_domains
            total_dofollow += max(0, ref_domains - nofollow)  # Dofollow = total - nofollow
            total_spam += spam
            total_quality += max(0, 100 - rank)  # Lower rank = higher quality
            
            # Collect diversity data (handle None values)
            tld_data = item.get("referring_links_tld") or {}
            countries_data = item.get("referring_links_countries") or {}
            platforms_data = item.get("referring_links_platform_types") or {}
            
            if isinstance(tld_data, dict):
                tlds.update(k for k in tld_data.keys() if k)
            if isinstance(countries_data, dict):
                countries.update(k for k in countries_data.keys() if k)
            if isinstance(platforms_data, dict):
                platforms.update(k for k in platforms_data.keys() if k)
        
        # Calculate averages
        avg_spam = total_spam / len(backlinks) if backlinks else 0
        avg_quality = total_quality / len(backlinks) if backlinks else 0
        
        # Calculate diversity score (capped at 20 points)
        diversity_score = min(20, (len(tlds) + len(countries) + len(platforms)) * 2)
        
        return {
            'total_referring_domains': total_referring_domains,
            'dofollow_backlinks': total_dofollow,
            'domain_quality': avg_quality,
            'diversity_score': diversity_score,
            'spam_score': avg_spam,
            'tld_count': len(tlds),
            'country_count': len(countries),
            'platform_count': len(platforms),
            'normalized_metrics': self._normalize_metrics(
                total_referring_domains, total_dofollow, avg_quality, diversity_score, avg_spam
            )
        }
    
    def _normalize_metrics(self, ref_domains: int, dofollow: int, quality: float, 
                          diversity: float, spam: float) -> Dict[str, float]:
        """
        Normalize all metrics to 0-100 scale
        
        Args:
            ref_domains: Total referring domains
            dofollow: Total dofollow backlinks
            quality: Average domain quality score
            diversity: Diversity score
            spam: Average spam score
            
        Returns:
            Dictionary of normalized metrics
        """
        # Normalize referring domains (max 10 domains = 100 points)
        normalized_ref_domains = min(100, (ref_domains / max(ref_domains, 10)) * 100)
        
        # Normalize dofollow backlinks (max 10 dofollow = 100 points)
        normalized_dofollow = min(100, (dofollow / max(dofollow, 10)) * 100)
        
        # Quality is already on 0-100 scale
        normalized_quality = min(100, quality)
        
        # Diversity is capped at 20 points
        normalized_diversity = min(20, diversity)
        
        # Spam score penalty (higher spam = more penalty)
        normalized_spam_penalty = min(100, spam)
        
        return {
            'referring_domains': normalized_ref_domains,
            'dofollow_backlinks': normalized_dofollow,
            'domain_quality': normalized_quality,
            'diversity': normalized_diversity,
            'spam_penalty': normalized_spam_penalty
        }
    
    def calculate_competitor_landscape_score(self, metrics: Dict[str, Any]) -> float:
        """
        Calculate the final Competitor Landscape Score using weighted formula
        
        Formula:
        30% from Total Referring Domains
        30% from Dofollow Backlinks
        20% from Average Quality (Rank)
        20% from Diversity (capped at 20)
        -20% Penalty from Spam Score
        
        Args:
            metrics: Dictionary containing normalized metrics
            
        Returns:
            Final score between 0 and 100
        """
        normalized = metrics['normalized_metrics']
        
        # Calculate weighted score
        score = (
            normalized['referring_domains'] * 0.30 +      # 30% weight
            normalized['dofollow_backlinks'] * 0.30 +     # 30% weight
            normalized['domain_quality'] * 0.20 +         # 20% weight
            normalized['diversity'] * 1.0 +               # 20% weight (already capped at 20)
            -normalized['spam_penalty'] * 0.20            # -20% penalty
        )
        
        # Clamp score between 0 and 100
        final_score = round(min(max(score, 0), 100), 2)
        
        return final_score
    
    def identify_top_competitors(self, backlinks: List[Dict[str, Any]], top_n: int = 5) -> List[Tuple[str, int]]:
        """
        Identify top competitors based on referring domain counts
        
        Args:
            backlinks: List of backlinks data
            top_n: Number of top competitors to return
            
        Returns:
            List of tuples (domain, referring_domains_count)
        """
        domain_count = Counter()
        
        for item in backlinks:
            domain = item.get("domain")
            if domain:
                domain_count[domain] += item.get("referring_domains", 0)
        
        return domain_count.most_common(top_n)
    
    def analyze_competitor_landscape(self, target_url: str, competitor_urls: List[str] = None, limit: Optional[int] = None) -> Dict[str, Any]:
        """
        Complete analysis of a domain's competitor landscape
        
        This method analyzes the backlink profile of a target domain using DataForSEO API.
        
        Automatic Logic:
        - If total referring domains <= 100: Uses ALL available data
        - If total referring domains > 100: Uses only TOP 100 (sorted by rank)
        
        Args:
            target_url: Target URL or domain to analyze
            competitor_urls: List of competitor URLs (not used in DataForSEO implementation)
            limit: Optional override for custom limit (default: automatic 100 max)
        
        Returns:
            Complete analysis results including score, metrics, and recommendations
        """
        # Extract domain from URL
        from urllib.parse import urlparse
        parsed = urlparse(target_url if target_url.startswith('http') else f'http://{target_url}')
        target_domain = parsed.netloc or parsed.path
        
        if not self.api_available:
            print("WARNING: DataForSEO API not available - credentials not configured")
            return {
                'score': 0,
                'error': 'DataForSEO API not configured. Please set DATAFORSEO_USERNAME and DATAFORSEO_PASSWORD environment variables.',
                'metrics': {
                    'total_referring_domains': 0,
                    'total_individual_backlinks': 0,
                    'dofollow_backlinks': 0,
                    'domain_quality': 0,
                    'diversity_score': 0,
                    'spam_score': 0
                },
                'top_competitors': [],
                'recommendations': ['Configure DataForSEO API credentials to enable competitor analysis']
            }
        
        print(f"Analyzing competitor landscape for: {target_domain}")
        
        # Fetch backlinks data
        referring_domains = self.fetch_backlinks_data(target_domain, limit=limit)
        
        if not referring_domains:
            print(f"WARNING: No referring domains found for {target_domain}")
            return {
                'score': 0,
                'error': 'No backlinks data found or API error occurred',
                'metrics': {
                    'total_referring_domains': 0,
                    'total_referring_domains_analyzed': 0,
                    'total_individual_backlinks': 0,
                    'dofollow_backlinks': 0,
                    'domain_quality': 0,
                    'diversity_score': 0,
                    'spam_score': 0,
                    'tld_count': 0,
                    'country_count': 0,
                    'platform_count': 0
                },
                'top_competitors': [],
                'recommendations': [
                    'Build high-quality backlinks from authoritative domains',
                    'Focus on getting dofollow links from relevant websites',
                    'Diversify backlink sources across different TLDs and countries'
                ]
            }
        
        # Calculate total individual backlinks across all referring domains
        total_individual_backlinks = sum(
            item.get("backlinks", 0) for item in referring_domains
        )
        
        print(f"Fetched {len(referring_domains)} referring domains")
        print(f"Total individual backlinks: {total_individual_backlinks}")
        
        # Calculate metrics
        metrics = self.calculate_metrics(referring_domains)
        
        # Calculate final score
        score = self.calculate_competitor_landscape_score(metrics)
        
        # Identify top competitors
        top_competitors = self.identify_top_competitors(referring_domains)
        
        # Generate recommendations
        recommendations = self._generate_recommendations(score, metrics, top_competitors)
        
        return {
            'score': score,
            'metrics': {
                'total_referring_domains': metrics['total_referring_domains'],
                'total_referring_domains_analyzed': len(referring_domains),
                'total_individual_backlinks': total_individual_backlinks,
                'dofollow_backlinks': metrics['dofollow_backlinks'],
                'domain_quality': round(metrics['domain_quality'], 2),
                'diversity_score': metrics['diversity_score'],
                'spam_score': round(metrics['spam_score'], 2),
                'tld_count': metrics['tld_count'],
                'country_count': metrics['country_count'],
                'platform_count': metrics['platform_count']
            },
            'top_competitors': [
                {'domain': domain, 'referring_domains': count}
                for domain, count in top_competitors
            ],
            'recommendations': recommendations
        }
    
    def _generate_recommendations(self, score: float, metrics: Dict[str, Any], 
                                 top_competitors: List[Tuple[str, int]]) -> List[str]:
        """
        Generate actionable recommendations based on competitor analysis
        
        Args:
            score: Overall competitor landscape score
            metrics: Calculated metrics
            top_competitors: List of top competitor domains
            
        Returns:
            List of actionable recommendations
        """
        recommendations = []
        
        # Score-based recommendations
        if score < 30:
            recommendations.append("Critical: Your backlink profile needs immediate attention. Focus on building high-quality backlinks.")
        elif score < 50:
            recommendations.append("Your backlink profile is below average. Implement a strategic link building campaign.")
        elif score < 70:
            recommendations.append("Good progress! Continue building quality backlinks to improve your competitive position.")
        else:
            recommendations.append("Excellent backlink profile! Maintain your link building efforts and monitor competitors.")
        
        # Referring domains recommendations
        if metrics['total_referring_domains'] < 10:
            recommendations.append("Increase the number of unique domains linking to your site (currently very low)")
        elif metrics['total_referring_domains'] < 50:
            recommendations.append("Work on acquiring backlinks from more unique referring domains")
        
        # Dofollow recommendations
        dofollow_ratio = metrics['dofollow_backlinks'] / max(metrics['total_referring_domains'], 1)
        if dofollow_ratio < 0.5:
            recommendations.append("Focus on acquiring more dofollow backlinks (currently low ratio)")
        
        # Quality recommendations
        if metrics['domain_quality'] < 30:
            recommendations.append("Target higher authority domains for backlinks to improve domain quality score")
        elif metrics['domain_quality'] < 50:
            recommendations.append("Consider reaching out to more authoritative websites in your niche")
        
        # Diversity recommendations
        if metrics['diversity_score'] < 10:
            recommendations.append("Diversify your backlink sources across different TLDs, countries, and platforms")
        elif metrics['diversity_score'] < 15:
            recommendations.append("Good diversity, but consider expanding to more international markets and platforms")
        
        # Spam recommendations
        if metrics['spam_score'] > 50:
            recommendations.append("URGENT: High spam score detected. Audit and disavow toxic backlinks immediately")
        elif metrics['spam_score'] > 30:
            recommendations.append("Monitor spam score closely and consider disavowing low-quality backlinks")
        
        # Competitor-based recommendations
        if top_competitors:
            top_domain = top_competitors[0][0]
            recommendations.append(f"Analyze backlink strategy of top referring domain: {top_domain}")
        
        return recommendations[:10]  # Limit to top 10 recommendations
