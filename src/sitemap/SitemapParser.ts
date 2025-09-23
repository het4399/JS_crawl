import { parseString } from 'xml2js';

export interface SitemapUrl {
    url: string;
    lastModified?: string;
    changeFrequency?: string;
    priority?: string;
}

export interface SitemapIndex {
    sitemaps: Array<{
        loc: string;
        lastModified?: string;
    }>;
}

export class SitemapParser {
    /**
     * Parse a standard XML sitemap and extract URLs
     */
    static async parseSitemap(xmlContent: string): Promise<SitemapUrl[]> {
        try {
            const result = await new Promise<any>((resolve, reject) => {
                parseString(xmlContent, { explicitArray: false }, (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
            const urls: SitemapUrl[] = [];
            
            if (result.urlset?.url) {
                const urlEntries = Array.isArray(result.urlset.url) 
                    ? result.urlset.url 
                    : [result.urlset.url];
                
                for (const entry of urlEntries) {
                    if (entry.loc) {
                        urls.push({
                            url: entry.loc,
                            lastModified: entry.lastmod,
                            changeFrequency: entry.changefreq,
                            priority: entry.priority
                        });
                    }
                }
            }
            
            return urls;
        } catch (error) {
            console.error('Error parsing sitemap:', error);
            return [];
        }
    }

    /**
     * Parse a sitemap index file and extract sitemap URLs
     */
    static async parseSitemapIndex(xmlContent: string): Promise<SitemapIndex> {
        try {
            const result = await new Promise<any>((resolve, reject) => {
                parseString(xmlContent, { explicitArray: false }, (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
            const sitemaps: Array<{ loc: string; lastModified?: string }> = [];
            
            if (result.sitemapindex?.sitemap) {
                const sitemapEntries = Array.isArray(result.sitemapindex.sitemap)
                    ? result.sitemapindex.sitemap
                    : [result.sitemapindex.sitemap];
                
                for (const entry of sitemapEntries) {
                    if (entry.loc) {
                        sitemaps.push({
                            loc: entry.loc,
                            lastModified: entry.lastmod
                        });
                    }
                }
            }
            
            return { sitemaps };
        } catch (error) {
            console.error('Error parsing sitemap index:', error);
            return { sitemaps: [] };
        }
    }

    /**
     * Check if XML content is a sitemap index
     */
    static isSitemapIndex(xmlContent: string): boolean {
        return xmlContent.includes('<sitemapindex') || xmlContent.includes('<sitemap>');
    }

    /**
     * Check if XML content is a standard sitemap
     */
    static isSitemap(xmlContent: string): boolean {
        return xmlContent.includes('<urlset') || xmlContent.includes('<url>');
    }
}
