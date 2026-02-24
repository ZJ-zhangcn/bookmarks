/**
 * 搜索联想 API
 * GET /api/suggest?q=xxx&engine=baidu|google|bing
 */

const { setCors } = require('./_lib/auth');
const { getSuggestions } = require('../shared/services/suggest');

module.exports = async function handler(req, res) {
    setCors(res, req);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { q, engine = 'baidu' } = req.query;
    const data = await getSuggestions(q, engine);
    res.json({ success: true, data });
};
