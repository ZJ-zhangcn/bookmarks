const cheerio = require('cheerio');

const IMAGE_EXT_SCORE = {
    '.svg': 40,
    '.png': 30,
    '.webp': 25,
    '.jpg': 20,
    '.jpeg': 20,
    '.ico': 10
};

function resolveIconHref(href, pageUrl) {
    const value = String(href || '').trim();
    if (!value || value.startsWith('data:') || value.startsWith('blob:')) return null;
    try {
        const parsed = new URL(value, pageUrl);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
    } catch {
        return null;
    }
}

function parseLargestSize(sizes) {
    const value = String(sizes || '').trim().toLowerCase();
    if (!value || value === 'any') return value === 'any' ? 512 : 0;
    return value.split(/\s+/).reduce((best, part) => {
        const match = part.match(/^(\d+)x(\d+)$/);
        if (!match) return best;
        return Math.max(best, Number(match[1]) || 0, Number(match[2]) || 0);
    }, 0);
}

function extensionScore(url) {
    try {
        const pathname = new URL(url).pathname.toLowerCase();
        const ext = Object.keys(IMAGE_EXT_SCORE).find(suffix => pathname.endsWith(suffix));
        return ext ? IMAGE_EXT_SCORE[ext] : 0;
    } catch {
        return 0;
    }
}

function relTokens(rel) {
    return String(rel || '').toLowerCase().split(/\s+/).filter(Boolean);
}

function addCandidate(candidates, seen, candidate) {
    if (!candidate?.url || seen.has(candidate.url)) return;
    seen.add(candidate.url);
    candidates.push(candidate);
}

async function selectBestIcons(html, pageUrl, fetchManifestJson = null) {
    const $ = cheerio.load(String(html || ''));
    const candidates = [];
    const seen = new Set();

    $('link[rel]').each((_, el) => {
        const rel = relTokens($(el).attr('rel'));
        const href = $(el).attr('href');
        const url = resolveIconHref(href, pageUrl);
        if (!url) return;

        if (rel.includes('manifest')) {
            addCandidate(candidates, seen, { url, score: 15, source: 'manifest-link' });
            return;
        }

        const isIcon = rel.includes('icon')
            || rel.includes('shortcut')
            || rel.includes('apple-touch-icon')
            || rel.includes('apple-touch-icon-precomposed')
            || rel.includes('mask-icon')
            || rel.includes('fluid-icon');
        if (!isIcon) return;

        let score = parseLargestSize($(el).attr('sizes')) + extensionScore(url);
        if (rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed')) score += 80;
        if (rel.includes('icon')) score += 60;
        if (rel.includes('mask-icon') || rel.includes('fluid-icon')) score += 40;
        addCandidate(candidates, seen, { url, score, source: 'link' });
    });

    const ogImage = $('meta[property="og:image"], meta[name="og:image"]').first().attr('content');
    const ogUrl = resolveIconHref(ogImage, pageUrl);
    addCandidate(candidates, seen, { url: ogUrl, score: 20 + extensionScore(ogUrl), source: 'og' });

    if (typeof fetchManifestJson === 'function') {
        const manifestLinks = candidates.filter(c => c.source === 'manifest-link');
        for (const link of manifestLinks) {
            try {
                const manifest = await fetchManifestJson(link.url);
                const icons = Array.isArray(manifest?.icons) ? manifest.icons : [];
                icons.forEach(icon => {
                    const iconUrl = resolveIconHref(icon.src, link.url);
                    if (!iconUrl) return;
                    const score = 100 + parseLargestSize(icon.sizes) + extensionScore(iconUrl);
                    addCandidate(candidates, seen, { url: iconUrl, score, source: 'manifest' });
                });
            } catch { /* manifest is optional */ }
        }
    }

    return candidates
        .filter(c => c.source !== 'manifest-link')
        .sort((a, b) => b.score - a.score)
        .map(c => c.url);
}

module.exports = { resolveIconHref, selectBestIcons, parseLargestSize };
