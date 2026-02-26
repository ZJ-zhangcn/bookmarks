/**
 * AI 响应解析模块
 */

function normalizeTagsInput(input) {
    if (Array.isArray(input)) {
        return input.map(t => String(t || '').trim()).filter(Boolean).slice(0, 20);
    }
    const text = String(input || '');
    return text.split(/[,\n，;；|/]+/g).map(t => t.trim()).filter(Boolean).slice(0, 20);
}

function safeJsonParse(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch {}
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) {
        try { return JSON.parse(text.slice(first, last + 1)); } catch {}
    }
    return null;
}

function detectAiUpstreamErrorFromText(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    const upper = raw.toUpperCase();

    const hit =
        upper.includes('RESOURCE_EXHAUSTED') ||
        upper.includes('INSUFFICIENT_QUOTA') ||
        upper.includes('QUOTA_EXCEEDED') ||
        upper.includes('RATE_LIMIT') ||
        upper.includes('RATE_LIMITED');

    if (!hit) return null;

    if (upper.includes('RESOURCE_EXHAUSTED')) {
        return { statusCode: 429, message: 'AI 网关额度/并发已耗尽（RESOURCE_EXHAUSTED），请稍后再试或更换 Key/网关' };
    }
    if (upper.includes('INSUFFICIENT_QUOTA') || upper.includes('QUOTA_EXCEEDED')) {
        return { statusCode: 429, message: 'AI 网关额度不足（QUOTA），请更换/充值 Key 或降低调用频率' };
    }
    if (upper.includes('RATE_LIMIT')) {
        return { statusCode: 429, message: 'AI 网关触发限流（RATE_LIMIT），请稍后再试或降低调用频率' };
    }

    return { statusCode: 502, message: `AI 网关返回错误：${raw.slice(0, 120)}` };
}

function parseAiTagsAndSummaryFromText(text) {
    const raw = String(text || '').trim();
    if (!raw) return { tags: [], summary: '', category: '', newCategory: '' };

    // 1) JSON 优先
    const parsed = safeJsonParse(raw);
    if (parsed && typeof parsed === 'object') {
        let tags = normalizeTagsInput(parsed.tags);
        let summary = String(parsed.summary || '').trim().slice(0, 80);
        let category = String(parsed.category || parsed.recommended_category || '').trim().slice(0, 50);
        let newCategory = String(parsed.new_category || parsed.newCategory || parsed.suggested_new_category || '').trim().slice(0, 50);

        if (!tags.length && typeof parsed.tags === 'string') {
            const maybe = safeJsonParse(parsed.tags);
            if (Array.isArray(maybe)) tags = normalizeTagsInput(maybe);
            if (maybe && typeof maybe === 'object') tags = normalizeTagsInput(maybe.tags);
        }

        if ((!tags.length || !summary) && typeof parsed.summary === 'string') {
            const nested = safeJsonParse(parsed.summary);
            if (nested && typeof nested === 'object') {
                const nestedTags = normalizeTagsInput(nested.tags);
                const nestedSummary = String(nested.summary || '').trim().slice(0, 80);
                if (!tags.length && nestedTags.length) tags = nestedTags;
                if ((!summary || summary === String(parsed.summary || '').trim().slice(0, 80)) && nestedSummary) {
                    summary = nestedSummary;
                }
                if (summary && summary.startsWith('{') && nestedTags.length && !nestedSummary) {
                    summary = '';
                }
            }
        }

        return { tags, summary, category, newCategory };
    }

    // 1.5) 兜底：支持"JSON 片段/非严格 JSON"场景
    const extractQuotedStrings = (s) => {
        const result = [];
        const re = /"((?:\\.|[^"\\])*)"/g;
        let m;
        while ((m = re.exec(String(s || '')))) {
            const v = String(m[1] || '').trim();
            if (v) result.push(v);
        }
        return result;
    };

    const tagsKeyMatch = raw.match(/["']tags["']\s*:\s*\[/i);
    const summaryKeyMatch = raw.match(/["']summary["']\s*:\s*"/i);

    if (tagsKeyMatch || summaryKeyMatch) {
        let tags = [];
        let summary = '';

        if (tagsKeyMatch && typeof tagsKeyMatch.index === 'number') {
            const startIndex = tagsKeyMatch.index + tagsKeyMatch[0].length;
            const rest = raw.slice(startIndex);
            const endIndex = rest.indexOf(']');
            const segment = endIndex >= 0 ? rest.slice(0, endIndex) : rest;
            tags = extractQuotedStrings(segment).slice(0, 20);
        }

        if (summaryKeyMatch) {
            const m = raw.match(/["']summary["']\s*:\s*"((?:\\.|[^"\\])*)/i);
            if (m && m[1]) summary = String(m[1]).trim();
        }

        if (tags.length || summary) {
            summary = summary.slice(0, 80);
            return { tags, summary, category: '', newCategory: '' };
        }
    }

    // 2) 兜底：支持行式输出
    const tagsLine = raw.match(/(?:^|\n)\s*(?:tags|标签)\s*[:：]\s*(.+)\s*(?:\n|$)/i);
    const summaryLine = raw.match(/(?:^|\n)\s*(?:summary|摘要)\s*[:：]\s*(.+)\s*(?:\n|$)/i);
    const categoryLine = raw.match(/(?:^|\n)\s*(?:category|分类|推荐分类)\s*[:：]\s*(.+)\s*(?:\n|$)/i);
    const newCategoryLine = raw.match(/(?:^|\n)\s*(?:new_category|新分类|建议新分类|建议分类)\s*[:：]\s*(.+)\s*(?:\n|$)/i);

    let tags = normalizeTagsInput(tagsLine ? tagsLine[1] : '');
    let summary = summaryLine ? String(summaryLine[1] || '').trim() : '';
    let category = categoryLine ? String(categoryLine[1] || '').trim().slice(0, 50) : '';
    let newCategory = newCategoryLine ? String(newCategoryLine[1] || '').trim().slice(0, 50) : '';

    if (/^(无|没有|空|-|none|null|n\/a)$/i.test(category)) category = '';
    if (/^(无|没有|空|-|none|null|n\/a)$/i.test(newCategory)) newCategory = '';

    if (!summary) {
        const firstNonTagsLine = raw
            .split('\n')
            .map(s => String(s || '').trim())
            .filter(Boolean)
            .find(line => !/^(?:tags|标签|category|分类|new_category|新分类)\s*[:：]/i.test(line));
        summary = firstNonTagsLine || '';
    }
    summary = summary.slice(0, 80);

    if (/^(?:tags|标签)\s*[:：]/i.test(summary)) {
        if (!tags.length) {
            const m = summary.match(/^(?:tags|标签)\s*[:：]\s*(.+)$/i);
            tags = normalizeTagsInput(m ? m[1] : '');
        }
        summary = '';
    }
    if (!tags.length) {
        const looseTags = raw.match(/(?:tags|标签)\s*[:：]\s*([^\n\r]+)/i);
        if (looseTags && looseTags[1]) tags = normalizeTagsInput(looseTags[1]);
    }
    if (!summary) {
        const looseSummary = raw.match(/(?:summary|摘要)\s*[:：]\s*([^\n\r]+)/i);
        if (looseSummary && looseSummary[1]) summary = String(looseSummary[1]).trim().slice(0, 80);
    }
    return { tags, summary, category, newCategory };
}

module.exports = {
    normalizeTagsInput,
    safeJsonParse,
    detectAiUpstreamErrorFromText,
    parseAiTagsAndSummaryFromText
};
