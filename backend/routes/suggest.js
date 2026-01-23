/**
 * 搜索联想路由模块
 */
const express = require('express');

module.exports = function(db) {
    const router = express.Router();

    // GET /api/suggest - 获取搜索联想
    router.get('/', async (req, res) => {
        const { q, engine = 'baidu' } = req.query;
        if (!q) {
            return res.json({ success: true, data: [] });
        }

        const suggestApis = {
            baidu: `https://suggestion.baidu.com/su?wd=${encodeURIComponent(q)}&cb=`,
            google: `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}`,
            bing: `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(q)}`
        };

        const apiUrl = suggestApis[engine];
        if (!apiUrl) {
            // 不支持的搜索引擎返回空数组
            return res.json({ success: true, data: [] });
        }

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
                // 百度返回 JSONP: ({q:"test",p:false,s:["a","b"]})
                const match = text.match(/s:\s*\[([^\]]*)\]/);
                if (match) {
                    try {
                        suggestions = JSON.parse('[' + match[1] + ']');
                    } catch { }
                }
            } else {
                // Google/Bing 返回 JSON 数组: ["query", ["suggestion1", "suggestion2"]]
                try {
                    const json = JSON.parse(text);
                    suggestions = Array.isArray(json[1]) ? json[1] : [];
                } catch { }
            }

            res.json({ success: true, data: suggestions.slice(0, 10) });
        } catch (e) {
            res.json({ success: true, data: [] });
        }
    });

    return router;
};
