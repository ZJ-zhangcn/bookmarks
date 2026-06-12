const { AppError } = require('../../utils');
const { createIconDiscoveryService } = require('../icon-discovery-service');
const { fetchPublicImageAsDataUrl } = require('./fetch-image');

function getErrorReason(error, fallback) {
    return error?.message || fallback;
}

function getActualDiscoveredIconUrl(discovered) {
    const usableSiteCandidate = (discovered?.candidates || [])
        .find(candidate => candidate?.usable === true && candidate?.type !== 'provider' && candidate?.url);
    if (usableSiteCandidate) return usableSiteCandidate.url;

    if (Array.isArray(discovered?.candidates) && discovered.candidates.length > 0) return '';
    if (discovered?.status === 'fallback') return '';

    const recommendedUrl = String(discovered?.recommended?.url || '').trim();
    if (recommendedUrl) return recommendedUrl;

    return String(discovered?.icons?.[0] || '').trim();
}

function createBookmarkIconService(db, deps = {}) {
    const imageFetcher = deps.fetchPublicImageAsDataUrl || fetchPublicImageAsDataUrl;
    const iconDiscovery = deps.iconDiscovery || createIconDiscoveryService(deps.discoveryOptions || {});

    async function convertUrlIconsToBase64() {
        const bookmarks = await db.queryAll(`
            SELECT id, icon_data FROM bookmarks
            WHERE icon_type = 'url' AND icon_data IS NOT NULL AND icon_data != ''
        `);

        let fixed = 0;
        let failed = 0;
        const failures = [];

        for (const bm of bookmarks) {
            try {
                const dataUrl = await imageFetcher(bm.icon_data);
                await db.execute('UPDATE bookmarks SET icon_type = ?, icon_data = ? WHERE id = ?', ['base64', dataUrl, bm.id]);
                fixed++;
            } catch (e) {
                failures.push({ id: bm.id, reason: getErrorReason(e, '转换失败') });
                failed++;
            }
        }

        return {
            message: `修复完成：${fixed} 个成功，${failed} 个保留原图标`,
            fixed,
            failed,
            total: bookmarks.length,
            failures
        };
    }

    async function fetchMissingBookmarkIcons() {
        const bookmarks = await db.queryAll(`
            SELECT id, url FROM bookmarks
            WHERE url IS NOT NULL AND url != ''
            AND (icon_data IS NULL OR icon_data = '' OR icon_type = 'auto')
        `);

        let fetched = 0;
        let failed = 0;
        const failures = [];

        for (const bm of bookmarks) {
            try {
                const discovered = await iconDiscovery.discoverIcons(bm.url);
                const iconUrl = getActualDiscoveredIconUrl(discovered);
                if (!iconUrl) throw new AppError('未找到可用图标', 502);

                const dataUrl = await imageFetcher(iconUrl);
                await db.execute('UPDATE bookmarks SET icon_type = ?, icon_data = ? WHERE id = ?', ['base64', dataUrl, bm.id]);
                fetched++;
            } catch (e) {
                failures.push({ id: bm.id, reason: getErrorReason(e, '获取失败') });
                failed++;
            }
        }

        return {
            message: `获取完成：${fetched} 个成功，${failed} 个失败`,
            fetched,
            failed,
            total: bookmarks.length,
            failures
        };
    }

    return {
        convertUrlIconsToBase64,
        fetchMissingBookmarkIcons
    };
}

module.exports = { createBookmarkIconService };
