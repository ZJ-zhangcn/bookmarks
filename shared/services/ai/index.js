/**
 * AI 服务 - 共享业务逻辑
 *
 * 统一入口，供 Express 和 Vercel 使用
 * - getAiPublicStatus() - 获取 AI 状态
 * - getBookmarkAi(db, id) - 获取书签 AI 数据
 * - saveBookmarkAi(db, { bookmarkId, tags, summary }) - 保存书签 AI 数据
 * - generateAi(db, body) - AI 生成标签/摘要
 */

const { getAiPublicStatus, isAiEnabledFlag, resolveRuntimeConfig } = require('./config');
const { normalizeTagsInput } = require('./parser');
const { ensureAiTables, upsertBookmarkAi } = require('./db');
const { createHttpError } = require('./http');
const { openaiGenerateWithConfig } = require('./providers/openai');
const { geminiGenerateWithConfig } = require('./providers/gemini');
const { claudeGenerateWithConfig } = require('./providers/claude');

async function getBookmarkAi(db, id) {
    await ensureAiTables(db);
    const row = await db.queryOne('SELECT * FROM bookmark_ai WHERE bookmark_id = ?', [id]);
    if (!row) return null;

    let tags = [];
    try { tags = JSON.parse(row.tags || '[]'); } catch {}
    return {
        bookmark_id: row.bookmark_id,
        tags: Array.isArray(tags) ? tags : [],
        summary: row.summary || '',
        provider: row.provider || null,
        model: row.model || null,
        updated_at: row.updated_at || null
    };
}

async function saveBookmarkAi(db, { bookmarkId, tags, summary }) {
    await ensureAiTables(db);
    await upsertBookmarkAi(db, {
        bookmarkId,
        tags: normalizeTagsInput(tags),
        summary: summary ? String(summary).trim().slice(0, 200) : '',
        provider: 'manual',
        model: null
    });
}

async function generateAi(db, body) {
    if (!isAiEnabledFlag()) {
        throw createHttpError(400, 'AI 功能未启用（请设置 AI_ENABLED=true）');
    }

    const { bookmarkId, name, url, description, persist, mode, tagsHint, categories } = body || {};
    const shouldPersist = String(persist).toLowerCase() === 'true';
    const id = String(bookmarkId || '').trim();

    const cfg = resolveRuntimeConfig(body);
    let result;
    if (cfg.provider === 'openai') result = await openaiGenerateWithConfig({ name, url, description, mode, tagsHint, categories, ...cfg });
    else if (cfg.provider === 'gemini') result = await geminiGenerateWithConfig({ name, url, description, mode, tagsHint, categories, ...cfg });
    else if (cfg.provider === 'claude') result = await claudeGenerateWithConfig({ name, url, description, mode, tagsHint, categories, ...cfg });
    else throw createHttpError(400, `不支持的 AI_PROVIDER: ${cfg.provider}`);

    console.log('[AI handler] result from provider:', JSON.stringify(result));

    if (shouldPersist) {
        if (!id) throw createHttpError(400, '持久化需要提供 bookmarkId');
        await ensureAiTables(db);
        await upsertBookmarkAi(db, { bookmarkId: id, ...result });
    }

    const responseData = { tags: result.tags, summary: result.summary, category: result.category || '', newCategory: result.newCategory || '' };
    console.log('[AI handler] response data:', JSON.stringify(responseData));
    return responseData;
}

module.exports = {
    getAiPublicStatus,
    getBookmarkAi,
    saveBookmarkAi,
    generateAi,
    normalizeTagsInput
};
