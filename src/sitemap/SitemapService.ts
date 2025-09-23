import { SitemapParser, SitemapUrl } from './SitemapParser';
import { RobotsParser, RobotsTxt } from './RobotsParser';

export interface SitemapDiscoveryResult {
    sitemapUrls: string[];
    discoveredUrls: SitemapUrl[];
    robotsTxt?: RobotsTxt;
    errors: string[];
}

export class SitemapService {
    /**
     * Discover sitemaps and URLs from a domain
     */
    static async discoverSitemaps(baseUrl: string): Promise<SitemapDiscoveryResult> {
        const result: SitemapDiscoveryResult = {
            sitemapUrls: [],
            discoveredUrls: [],
            errors: []
        };
        
        try {
            const baseDomain = new URL(baseUrl).origin;
            
            // 1. Check robots.txt for sitemap directives
            const robotsTxt = await this.fetchRobotsTxt(baseDomain);
            if (robotsTxt) {
                result.robotsTxt = robotsTxt;
                result.sitemapUrls.push(...robotsTxt.sitemaps);
            }
            
            // 2. Try common sitemap locations
            const commonSitemaps = [
                `${baseDomain}/sitemap.xml`,
                `${baseDomain}/sitemap_index.xml`,
                `${baseDomain}/sitemaps.xml`
            ];
            
            for (const sitemapUrl of commonSitemaps) {
                if (!result.sitemapUrls.includes(sitemapUrl)) {
                    result.sitemapUrls.push(sitemapUrl);
                }
            }
            
            // 3. Fetch and parse all sitemaps
            const allUrls = new Set<string>();
            
            for (const sitemapUrl of result.sitemapUrls) {
                try {
                    const sitemapContent = await this.fetchSitemap(sitemapUrl);
                    if (sitemapContent) {
                        if (SitemapParser.isSitemapIndex(sitemapContent)) {
                            // Handle sitemap index
                            const index = await SitemapParser.parseSitemapIndex(sitemapContent);
                            for (const sitemap of index.sitemaps) {
                                try {
                                    const subSitemapContent = await this.fetchSitemap(sitemap.loc);
                                    if (subSitemapContent && SitemapParser.isSitemap(subSitemapContent)) {
                                        const urls = await SitemapParser.parseSitemap(subSitemapContent);
                                        for (const url of urls) {
                                            if (!allUrls.has(url.url)) {
                                                allUrls.add(url.url);
                                                result.discoveredUrls.push(url);
                                            }
                                        }
                                    }
                                } catch (error) {
                                    result.errors.push(`Failed to fetch sub-sitemap ${sitemap.loc}: ${error}`);
                                }
                            }
                        } else if (SitemapParser.isSitemap(sitemapContent)) {
                            // Handle regular sitemap
                            const urls = await SitemapParser.parseSitemap(sitemapContent);
                            for (const url of urls) {
                                if (!allUrls.has(url.url)) {
                                    allUrls.add(url.url);
                                    result.discoveredUrls.push(url);
                                }
                            }
                        }
                    }
                } catch (error) {
                    result.errors.push(`Failed to fetch sitemap ${sitemapUrl}: ${error}`);
                }
            }
            
        } catch (error) {
            result.errors.push(`Sitemap discovery failed: ${error}`);
        }
        
        return result;
    }
    
    /**
     * Fetch robots.txt from a domain
     */
    private static async fetchRobotsTxt(baseDomain: string): Promise<RobotsTxt | null> {
        try {
            const robotsUrl = `${baseDomain}/robots.txt`;
            const response = await fetch(robotsUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'WebCrawler/1.0'
                }
            });
            
            if (response.ok) {
                const content = await response.text();
                return RobotsParser.parseRobotsTxt(content);
            }
        } catch (error) {
            console.warn(`Failed to fetch robots.txt from ${baseDomain}:`, error);
        }
        
        return null;
    }
    
    /**
     * Fetch sitemap content
     */
    private static async fetchSitemap(sitemapUrl: string): Promise<string | null> {
        try {
            const response = await fetch(sitemapUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'WebCrawler/1.0',
                    'Accept': 'application/xml, text/xml, */*'
                }
            });
            
            if (response.ok) {
                return await response.text();
            }
        } catch (error) {
            console.warn(`Failed to fetch sitemap ${sitemapUrl}:`, error);
        }
        
        return null;
    }
    
    /**
     * Filter URLs based on robots.txt rules
     */
    static filterUrlsByRobots(urls: SitemapUrl[], robotsTxt: RobotsTxt): SitemapUrl[] {
        if (!robotsTxt) return urls;
        
        return urls.filter(urlData => {
            return RobotsParser.isUrlAllowed(urlData.url, robotsTxt);
        });
    }
}
