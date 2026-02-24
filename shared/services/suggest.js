/**
 * 搜索联想服务
 * 纯代理逻辑，无数据库操作
 */

const SUGGEST_APIS = {
    baidu: (q) => `https://suggestion.baidu.com/su?wd=${encodeURIComponent(q)}&cb=`,
    google: (q) => `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}`,
    bing: (q) => `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(q)}`
};

async function getSuggestions(q, engine = 'baidu') {
    if (!q) return [];

    const apiFn = SUGGEST_APIS[engine];
    if (!apiFn) return [];

    const apiUrl = apiFn(q);

    try {
        const response = await fetch(apiUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        const decoder = new TextDecoder(engine === 'baidu' ? 'gbk' : 'utf-8');
        const text = decoder.decode(buffer);
        let suggestions = [];

        if (engine === 'baidu') {
            const match = text.match(/s:\s*\[([^\]]*)\]/);
            if (match) {
                try {
                    suggestions = JSON.parse('[' + match[1] + ']');
                } catch { }
            }
        } else {
            try {
                const json = JSON.parse(text);
                suggestions = Array.isArray(json[1]) ? json[1] : [];
            } catch { }
        }

        return suggestions.slice(0, 10);
    } catch (e) {
        return [];
    }
}

module.exports = { getSuggestions };
