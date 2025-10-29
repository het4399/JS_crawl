import { Element } from 'cheerio';

/**
 * Generate XPath for a DOM element
 * Capped at depth ~10 to avoid overly long paths
 */
export function generateXPath(element: Element): string {
    const path: string[] = [];
    let current: Element | null = element;
    let depth = 0;
    const maxDepth = 10;

    while (current && depth < maxDepth) {
        const tagName = current.tagName?.toLowerCase();
        if (!tagName) break;

        // Get index among siblings with same tag
        let index = 1;
        let sibling = current.prev;
        while (sibling) {
            if ('tagName' in sibling && sibling.tagName?.toLowerCase() === tagName) {
                index++;
            }
            sibling = sibling.prev;
        }

        // Build path segment
        let segment = tagName;
        
        // Add index if there are multiple siblings with same tag
        const nextSibling = current.next;
        const hasMultipleSiblings = nextSibling && 'tagName' in nextSibling && nextSibling.tagName?.toLowerCase() === tagName;
        if (hasMultipleSiblings || index > 1) {
            segment += `[${index}]`;
        }

        // Add id or class if available and useful
        const id = current.attribs?.id;
        const className = current.attribs?.class;
        
        if (id) {
            segment = `${tagName}[@id='${id}']`;
        } else if (className && className.length < 50) { // Avoid overly long class names
            const cleanClass = className.split(' ')[0]; // Take first class only
            segment = `${tagName}[@class='${cleanClass}']`;
        }

        path.unshift(segment);
        current = current.parent as Element | null;
        depth++;
    }

    return '//' + path.join('/');
}

/**
 * Determine link position based on DOM hierarchy
 */
export function getLinkPosition(element: Element, $: any): string {
    // Check for specific semantic elements first
    
    // Header detection
    if ($(element).closest('header, [role="banner"]').length > 0) {
        return 'Header';
    }
    
    // Footer detection
    if ($(element).closest('footer, [role="contentinfo"]').length > 0) {
        return 'Footer';
    }
    
    // Navigation detection
    if ($(element).closest('nav, [role="navigation"]').length > 0) {
        return 'Navigation';
    }
    
    // Sidebar detection
    if ($(element).closest('aside, [role="complementary"]').length > 0) {
        return 'Sidebar';
    }
    
    // Main content detection
    if ($(element).closest('main, [role="main"]').length > 0) {
        return 'Main';
    }
    
    // Check for common patterns in class names
    const className = element.attribs?.class?.toLowerCase() || '';
    if (className.includes('header') || className.includes('nav')) {
        return 'Header';
    }
    if (className.includes('footer')) {
        return 'Footer';
    }
    if (className.includes('sidebar') || className.includes('aside')) {
        return 'Sidebar';
    }
    if (className.includes('main') || className.includes('content')) {
        return 'Main';
    }
    
    // Default to Main if no specific pattern found
    return 'Main';
}

/**
 * Extract link metadata from a Cheerio element
 */
export function extractLinkMetadata(element: Element, sourceUrl: string, $: any): {
    targetUrl: string;
    anchorText: string;
    xpath: string;
    position: string;
    rel: string;
    nofollow: boolean;
} {
    const href = $(element).attr('href');
    
    if (!href) {
        throw new Error('No href attribute found');
    }

    // Convert relative URLs to absolute
    let targetUrl: string;
    try {
        targetUrl = new URL(href, sourceUrl).toString();
    } catch {
        throw new Error('Invalid URL');
    }

    // Extract anchor text (trimmed)
    const anchorText = $(element).text().trim();
    
    // Generate XPath
    const xpath = generateXPath(element);
    
    // Determine position
    const position = getLinkPosition(element, $);
    
    // Extract rel attributes
    const rel = $(element).attr('rel') || '';
    const nofollow = rel.toLowerCase().includes('nofollow');

    return {
        targetUrl,
        anchorText,
        xpath,
        position,
        rel,
        nofollow
    };
}
