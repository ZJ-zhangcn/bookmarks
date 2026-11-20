/* global URL */
function resolveWebsiteUrl(query) {
    const value = String(query || '').trim();
    if (!value || /[\s\\]/.test(value)) return null;

    const hasProtocol = /^https?:\/\//i.test(value);
    const address = value.replace(/^\/\//, '');
    try {
        const url = new URL(hasProtocol ? value : `https://${address}`);
        if (url.username || url.password) return null;

        if (!hasProtocol) {
            const authority = address.split(/[/?#]/, 1)[0];
            const isDomain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]+)$/i.test(url.hostname);
            const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$/.test(authority);
            const isLocalAddress = url.hostname === 'localhost' || url.hostname.startsWith('[');
            if (!isDomain && !isIpv4 && !isLocalAddress) return null;
        }

        return url.href;
    } catch {
        return null;
    }
}

function buildWebSearchUrl(query, engineUrl) {
    const value = String(query || '').trim();
    if (!value) return null;
    return resolveWebsiteUrl(value) || engineUrl + encodeURIComponent(value);
}

module.exports = { resolveWebsiteUrl, buildWebSearchUrl };
