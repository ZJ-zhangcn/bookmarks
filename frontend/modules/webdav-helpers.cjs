function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildWebdavStatusPanel({ status = 'info', operation = '同步', path = '', includeIcons = true, message = '', at = new Date().toISOString() } = {}) {
    const time = at ? new Date(at) : new Date();
    const timeText = Number.isNaN(time.getTime()) ? '' : time.toLocaleString('zh-CN');
    const iconMode = includeIcons ? '包含图标' : '不含图标';
    return `
        <div class="webdav-status-panel ${escapeHtml(status)}">
            <div class="webdav-status-main">${escapeHtml(message || operation)}</div>
            <div class="webdav-status-grid">
                <span>操作</span><strong>${escapeHtml(operation)}</strong>
                <span>文件</span><strong>${escapeHtml(path || '未设置')}</strong>
                <span>图标</span><strong>${escapeHtml(iconMode)}</strong>
                <span>时间</span><strong>${escapeHtml(timeText)}</strong>
            </div>
        </div>
    `;
}

async function parseJsonResponse(response, fallbackMessage = '请求失败，服务器返回了非 JSON 响应') {
    try {
        return await response.json();
    } catch (err) {
        return {
            success: false,
            error: `${fallbackMessage}: ${err.message}`
        };
    }
}

module.exports = { buildWebdavStatusPanel, parseJsonResponse };
