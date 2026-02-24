/**
 * 分类 API
 * GET /api/categories - 获取所有分类
 * POST /api/categories - 创建/更新分类
 * DELETE /api/categories?id=xxx - 删除分类
 * PUT /api/categories - 排序
 */

const db = require('./_lib/db');
const { requireAdmin, setCors } = require('./_lib/auth');
const categoriesService = require('../shared/services/categories');

module.exports = async function handler(req, res) {
    setCors(res, req);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'GET') {
            const categories = await categoriesService.getAllCategories(db);
            return res.json({ success: true, data: categories });
        }

        if (!requireAdmin(req, res)) return;

        if (req.method === 'POST') {
            const { id, name, icon } = req.body;
            const result = await categoriesService.saveCategory(db, { id, name, icon });
            return res.json({ success: true, data: result });
        }

        if (req.method === 'PUT') {
            const { order } = req.body;
            if (!Array.isArray(order)) {
                return res.status(400).json({ success: false, error: '无效的排序数据' });
            }
            await categoriesService.sortCategories(db, order);
            return res.json({ success: true });
        }

        if (req.method === 'DELETE') {
            const { id } = req.query;
            if (!id) {
                return res.status(400).json({ success: false, error: '缺少分类 ID' });
            }
            await categoriesService.deleteCategory(db, id);
            return res.json({ success: true });
        }

        res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (e) {
        console.error('Categories API error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
