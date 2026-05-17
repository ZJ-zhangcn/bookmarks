function clampText(value, max = 500) {
    return String(value || '').trim().slice(0, max);
}

function numberOrZero(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function pickResource(resource = {}) {
    return {
        used: numberOrZero(resource.used),
        total: numberOrZero(resource.total),
        usagePercent: numberOrZero(resource.usagePercent)
    };
}

function summarizeServerForHermes(server = {}) {
    return {
        id: clampText(server.id, 80),
        name: clampText(server.name || server.id, 120),
        status: clampText(server.status || 'unknown', 40),
        region: clampText(server.region, 120),
        role: clampText(server.role, 120),
        lastSeen: numberOrZero(server.lastSeen),
        uptime: numberOrZero(server.uptime),
        cpu: {
            usage: numberOrZero(server.cpu?.usage),
            cores: numberOrZero(server.cpu?.cores)
        },
        memory: pickResource(server.memory),
        disk: pickResource(server.disk),
        docker: {
            running: numberOrZero(server.docker?.running),
            total: numberOrZero(server.docker?.total),
            unhealthy: numberOrZero(server.docker?.unhealthy)
        },
        network: {
            rxRate: numberOrZero(server.network?.rxRate),
            txRate: numberOrZero(server.network?.txRate)
        }
    };
}

function summarizeCardForHermes(card = {}) {
    return {
        id: clampText(card.id, 80),
        name: clampText(card.name, 160),
        url: clampText(card.url, 600),
        description: clampText(card.description, 600),
        item_type: clampText(card.item_type, 40),
        component_type: clampText(card.component_type, 120)
    };
}

function currentPageInfo() {
    const location = globalThis.window?.location || {};
    return {
        href: clampText(location.href || `${location.protocol || 'https:'}//${location.host || 'localhost'}`, 600),
        origin: clampText(location.origin || '', 300),
        title: clampText(globalThis.document?.title || '', 160)
    };
}

function buildServiceDiagnoseInput({ server = {}, card = {}, note = '' } = {}) {
    return {
        kind: 'service_diagnose',
        server: summarizeServerForHermes(server),
        card: summarizeCardForHermes(card),
        note: clampText(note, 1500),
        page: currentPageInfo()
    };
}

function buildBookmarkOrganizeInput({ bookmarks = [], categories = [], note = '' } = {}) {
    return {
        kind: 'bookmark_organize',
        bookmarks: Array.isArray(bookmarks) ? bookmarks.slice(0, 200).map(summarizeCardForHermes) : [],
        categories: Array.isArray(categories) ? categories.slice(0, 80).map(category => ({
            id: clampText(category.id, 80),
            name: clampText(category.name, 160),
            icon: clampText(category.icon, 20),
            type: clampText(category.type, 40)
        })) : [],
        note: clampText(note, 1500),
        page: currentPageInfo()
    };
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderHermesAnswer(job = {}) {
    if (!job || job.status === 'queued' || job.status === 'running') {
        return '<div class="hermes-result pending"><strong>Hermes 正在分析...</strong><span>任务已提交，请稍候。</span></div>';
    }
    if (job.status === 'failed') {
        return `<div class="hermes-result failed"><strong>Hermes 调用失败</strong><span>${escapeHtml(job.error || '未知错误')}</span></div>`;
    }
    const text = escapeHtml(job.result?.text || 'Hermes 没有返回内容。').replace(/\n/g, '<br>');
    return `<div class="hermes-result succeeded"><strong>Hermes 建议</strong><div>${text}</div></div>`;
}

const api = {
    summarizeServerForHermes,
    summarizeCardForHermes,
    buildServiceDiagnoseInput,
    buildBookmarkOrganizeInput,
    renderHermesAnswer,
    escapeHtml
};

export {
    summarizeServerForHermes,
    summarizeCardForHermes,
    buildServiceDiagnoseInput,
    buildBookmarkOrganizeInput,
    renderHermesAnswer,
    escapeHtml
};

export default api;
