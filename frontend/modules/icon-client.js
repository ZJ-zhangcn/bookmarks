import * as state from './state.js';
import { normalizeFaviconResponse } from './favicon-helpers.cjs';
import iconPolicy from '../../shared/icon-policy.cjs';

function unwrapFaviconData(raw) {
    if (raw?.success && raw.data !== undefined) return raw.data;
    return raw;
}

function normalizeCandidate(candidate) {
    if (!candidate) return null;
    const url = typeof candidate === 'string' ? candidate : candidate.url;
    const normalizedUrl = String(url || '').trim();
    if (!normalizedUrl) return null;
    const defaults = iconPolicy.getIconCandidateDefaults(normalizedUrl, {
        source: typeof candidate === 'object' ? candidate.source : undefined
    });
    return {
        ...defaults,
        ...(typeof candidate === 'object' ? candidate : {}),
        url: normalizedUrl,
        displayUrl: typeof candidate === 'object' ? candidate.displayUrl || '' : '',
        label: (typeof candidate === 'object' && candidate.label) || defaults.label,
        type: (typeof candidate === 'object' && candidate.type) || defaults.type,
        source: (typeof candidate === 'object' && candidate.source) || defaults.source,
        score: Number(typeof candidate === 'object' ? candidate.score : 0) || defaults.score || 0,
        usable: typeof candidate === 'object' && candidate.usable !== undefined ? Boolean(candidate.usable) : true,
        reason: (typeof candidate === 'object' && candidate.reason) || ''
    };
}

export function normalizeIconCandidates(raw) {
    const data = unwrapFaviconData(raw);
    const structured = Array.isArray(data?.candidates) || Array.isArray(data?.fallbacks)
        ? [...(data.candidates || []), ...(data.fallbacks || [])]
        : [];
    const source = structured.length > 0 ? structured : normalizeFaviconResponse(raw);
    const seen = new Set();
    const out = [];
    for (const candidate of source) {
        const normalized = normalizeCandidate(candidate);
        if (!normalized || seen.has(normalized.url)) continue;
        seen.add(normalized.url);
        out.push(normalized);
    }
    return out;
}

export async function discoverIcons(url) {
    const res = await fetch(`${state.API_BASE}/api/favicon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
    });
    const raw = await res.json().catch(() => null);
    return {
        ok: res.ok && raw?.success === true,
        raw,
        icons: normalizeFaviconResponse(raw),
        candidates: normalizeIconCandidates(raw)
    };
}
