import normalizeUrl from 'normalize-url';

export type UrlNormalizationOptions = {
    allowedHost: string;
    allowSubdomains: boolean;
    denyParamPrefixes: string[];
};

export function isSameSite(urlString: string, allowedHost: string, allowSubdomains: boolean): boolean {
    try {
        const url = new URL(urlString);
        if (url.hostname === allowedHost) return true;
        return allowSubdomains && url.hostname.endsWith(`.${allowedHost}`);
    } catch {
        return false;
    }
}

export function canonicalizeUrl(urlString: string, options: UrlNormalizationOptions): string | null {
    try {
        const url = new URL(urlString);

        // Only keep same-site links
        if (!isSameSite(url.href, options.allowedHost, options.allowSubdomains)) return null;

        // Remove fragments
        url.hash = '';

        // Remove denied query params by prefix match (e.g., utm_*, session, sort)
        const params = url.searchParams;
        const toDelete: string[] = [];
        params.forEach((_v, key) => {
            const lowerKey = key.toLowerCase();
            if (options.denyParamPrefixes.some((p) => lowerKey === p || lowerKey.startsWith(`${p}`))) {
                toDelete.push(key);
            }
        });
        toDelete.forEach((k) => params.delete(k));

        // Normalize for dedupe consistency
        const normalized = normalizeUrl(url.toString(), {
            removeTrailingSlash: true,
            sortQueryParameters: true,
            removeDirectoryIndex: true,
            stripHash: true,
            stripWWW: false,
        });

        return normalized;
    } catch {
        return null;
    }
}


