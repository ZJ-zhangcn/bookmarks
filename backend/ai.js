/**
 * AI 相关 API（可选功能）
 *
 * 统一入口：/api/ai?action=...
 * - GET  /api/ai?action=status
 * - GET  /api/ai?action=bookmark&id=...
 * - POST /api/ai?action=bookmark   （保存标签/摘要）
 * - POST /api/ai?action=generate   （AI 生成标签/摘要，可选持久化）
 */

const aiService = require('../shared/services/ai');

function registerAiRoutes(app, db) {
    app.all('/api/ai', async (req, res) => {
        const action = String(req.query.action || '').toLowerCase();

        try {
            if (req.method === 'GET' && action === 'status') {
                return res.json({ success: true, data: aiService.getAiPublicStatus() });
            }

            if (req.method === 'GET' && action === 'bookmark') {
                const id = String(req.query.id || '').trim();
                if (!id) return res.status(400).json({ success: false, error: '缺少书签 ID' });
                const data = await aiService.getBookmarkAi(db, id);
                return res.json({ success: true, data });
            }

            if (req.method === 'POST' && action === 'bookmark') {
                const { bookmarkId, tags, summary } = req.body || {};
                const id = String(bookmarkId || '').trim();
                if (!id) return res.status(400).json({ success: false, error: '缺少书签 ID' });
                await aiService.saveBookmarkAi(db, { bookmarkId: id, tags, summary });
                return res.json({ success: true });
            }

            if (req.method === 'POST' && action === 'generate') {
                const data = await aiService.generateAi(db, req.body);
                return res.json({ success: true, data });
            }

            return res.status(404).json({ success: false, error: '未知操作' });
        } catch (e) {
            const statusCode = Number.isInteger(e?.statusCode) ? e.statusCode : 500;
            return res.status(statusCode).json({ success: false, error: e.message });
        }
    });
}

module.exports = { registerAiRoutes };
