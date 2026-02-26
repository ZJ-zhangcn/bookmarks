/**
 * AI Prompt 构建模块
 */

const DEFAULT_AI_SYSTEM_PROMPT = [
    '你是一个书签整理助手。',
    '你的任务：根据输入的书签信息生成 tags、summary 和分类推荐。',
    '输出必须且只能包含四行（不要 JSON、不要代码块、不要多余文字、不要空行）：',
    'tags: 标签1,标签2,标签3',
    'summary: 一句话摘要（<= 40 字）',
    'category: 推荐的已有分类名称',
    'new_category: 建议的新分类名称',
    '规则：',
    '- tags：3~8 个中文标签，每个 2~8 字，去重，按重要性排序；尽量是"用途/内容类型/领域"，避免泛词（如"官网/网站/主页"）。',
    '- summary：中文一句话，不要包含"tags:"前缀，不要引号/花括号/JSON，不要换行。',
    '- category：必须从用户提供的"已有分类列表"中选择最匹配的一个，完全匹配列表中的名称；若列表为空或确实无匹配则填"无"。',
    '- new_category：若已有分类都不太合适，建议一个简洁的新分类名称（2~6字）；若已有分类已足够合适则填"无"。',
    '若信息不足：给出最保守的用途/领域标签与最保守的用途描述。'
].join('\n');

function normalizeAiMode(input) {
    const m = String(input || '').trim().toLowerCase();
    if (m === 'refine' || m === 'retry') return 'refine';
    return 'default';
}

function getAiSystemPrompt(mode) {
    const normalizedMode = normalizeAiMode(mode);
    const override = String(process.env.AI_SYSTEM_PROMPT || '').trim();
    const base = (override || DEFAULT_AI_SYSTEM_PROMPT).slice(0, 2000);

    if (normalizedMode !== 'refine') return base;

    return [
        base,
        '',
        '【精炼模式】',
        '- 你必须输出 summary 行，且 summary 不允许为空。',
        '- 若 summary 难以判断，使用名称/网址给出最保守的一句话用途描述。'
    ].join('\n');
}

function buildAiUserPrompt(payload, mode) {
    const name = String(payload?.name || '').trim().slice(0, 200);
    const url = String(payload?.url || '').trim().slice(0, 2000);
    const description = String(payload?.description || '').trim().slice(0, 500);
    const tagsHint = String(payload?.tagsHint || '').trim().slice(0, 200);
    const categoriesHint = Array.isArray(payload?.categories)
        ? payload.categories.map(c => String(c || '').trim()).filter(Boolean).slice(0, 50).join('、')
        : '';
    const normalizedMode = normalizeAiMode(mode);
    return [
        '书签信息如下：',
        `名称: ${name || '-'}`,
        `网址: ${url || '-'}`,
        `描述: ${description || '-'}`,
        tagsHint ? `现有标签（可参考，不必照抄）: ${tagsHint}` : '',
        categoriesHint ? `已有分类列表: ${categoriesHint}` : '',
        '',
        normalizedMode === 'refine' ? '请严格按系统规则输出四行结果（summary 必须非空）。' : '请按系统规则输出四行结果。'
    ].join('\n');
}

function buildFallbackSummary({ name, url, tags }) {
    const safeName = String(name || '').trim();
    const safeUrl = String(url || '').trim();
    const tag0 = Array.isArray(tags) && tags[0] ? String(tags[0]).trim() : '';

    let host = '';
    try { host = new URL(safeUrl).hostname.replace(/^www\./, ''); } catch {}

    const subject = safeName || host || '该站点';
    if (tag0) return `${subject}：${tag0}相关站点`.slice(0, 40);
    return `${subject}：常用网站`.slice(0, 40);
}

module.exports = {
    DEFAULT_AI_SYSTEM_PROMPT,
    normalizeAiMode,
    getAiSystemPrompt,
    buildAiUserPrompt,
    buildFallbackSummary
};
