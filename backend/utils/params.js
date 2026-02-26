/**
 * 参数解析与格式化工具函数
 */

/**
 * 将输入值限制在 [min, max] 范围内的整数，无效时返回 fallback
 */
function clampInt(raw, min, max, fallback) {
    const n = parseInt(String(raw ?? ''), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

/**
 * 将输入值转换为 0 或 1（布尔整数）
 */
function toInt01(raw, fallback = 0) {
    if (raw === true) return 1;
    if (raw === false) return 0;
    const s = String(raw ?? '').trim().toLowerCase();
    if (s === '1' || s === 'true' || s === 'yes') return 1;
    if (s === '0' || s === 'false' || s === 'no') return 0;
    return fallback;
}

/**
 * Date 对象转换为 MySQL datetime 字符串格式
 */
function toMysqlDatetimeString(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * 将原始日期输入规范化为数据库兼容的日期字符串
 */
function normalizeDatetime(raw, useMysql) {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return useMysql ? toMysqlDatetimeString(d) : d.toISOString();
}

/**
 * 获取当前时间的数据库兼容字符串
 */
function nowDatetime(useMysql) {
    const d = new Date();
    return useMysql ? toMysqlDatetimeString(d) : d.toISOString();
}

module.exports = { clampInt, toInt01, toMysqlDatetimeString, normalizeDatetime, nowDatetime };
