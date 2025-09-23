export interface RobotsTxt {
    sitemaps: string[];
    disallowRules: string[];
    allowRules: string[];
    crawlDelay?: number;
    userAgent: string;
}

export class RobotsParser {
    /**
     * Parse robots.txt content and extract sitemap URLs
     */
    static parseRobotsTxt(content: string, userAgent: string = '*'): RobotsTxt {
        const lines = content.split('\n').map(line => line.trim());
        const sitemaps: string[] = [];
        const disallowRules: string[] = [];
        const allowRules: string[] = [];
        let crawlDelay: number | undefined;
        
        let currentUserAgent = '';
        let isRelevantSection = false;
        
        for (const line of lines) {
            if (line.startsWith('#')) continue; // Skip comments
            
            const colonIndex = line.indexOf(':');
            if (colonIndex === -1) continue;
            
            const directive = line.substring(0, colonIndex).toLowerCase().trim();
            const value = line.substring(colonIndex + 1).trim();
            
            if (directive === 'user-agent') {
                currentUserAgent = value.toLowerCase();
                isRelevantSection = currentUserAgent === userAgent.toLowerCase() || currentUserAgent === '*';
            } else if (directive === 'sitemap') {
                sitemaps.push(value);
            } else if (isRelevantSection) {
                if (directive === 'disallow') {
                    disallowRules.push(value);
                } else if (directive === 'allow') {
                    allowRules.push(value);
                } else if (directive === 'crawl-delay') {
                    const delay = parseInt(value, 10);
                    if (!isNaN(delay)) {
                        crawlDelay = delay;
                    }
                }
            }
        }
        
        return {
            sitemaps,
            disallowRules,
            allowRules,
            crawlDelay,
            userAgent
        };
    }
    
    /**
     * Check if a URL is allowed by robots.txt rules
     */
    static isUrlAllowed(url: string, robotsTxt: RobotsTxt): boolean {
        const urlPath = new URL(url).pathname;
        
        // Check disallow rules first
        for (const rule of robotsTxt.disallowRules) {
            if (rule === '/') return false; // Disallow everything
            if (rule === '') continue; // Empty disallow means allow
            
            // Convert robots.txt pattern to regex
            const pattern = rule
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex chars
                .replace(/\*/g, '.*'); // Convert * to .*
            
            const regex = new RegExp(`^${pattern}`);
            if (regex.test(urlPath)) {
                return false;
            }
        }
        
        // Check allow rules (they override disallow)
        for (const rule of robotsTxt.allowRules) {
            if (rule === '') continue;
            
            const pattern = rule
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                .replace(/\*/g, '.*');
            
            const regex = new RegExp(`^${pattern}`);
            if (regex.test(urlPath)) {
                return true;
            }
        }
        
        return true; // Default to allowed
    }
}
