/**
 * 系统状态 API
 * GET /api/system/stats - 获取系统状态
 *
 * 注意：Vercel Serverless 环境无法获取真实系统状态
 * 此 API 返回空数据，系统状态组件在 Vercel 上不可用
 */

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'GET') {
        // Vercel Serverless 环境无法获取真实系统状态
        // 返回提示信息
        return res.json({
            success: false,
            error: '系统状态监控仅在 Docker 部署模式下可用',
            data: null
        });
    }

    res.status(405).json({ success: false, error: 'Method not allowed' });
};
