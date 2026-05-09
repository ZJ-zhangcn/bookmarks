/**
 * 图标库服务
 */
const { newId } = require('./ids');

async function fetchLimitedImage(url) {
    const safeFetch = require('../../backend/utils/safe-fetch');
    const { response } = await safeFetch.safeFetchPublicUrl(url, {
        timeoutMs: 5000,
        fetchOptions: { headers: { 'User-Agent': 'Mozilla/5.0' } }
    });
    if (!response.ok) {
        const err = new Error(`HTTP ${response.status}`);
        err.statusCode = 500;
        throw err;
    }
    const contentType = response.headers.get('content-type') || 'image/png';
    if (!contentType.startsWith('image/')) {
        const err = new Error('无效的图片类型');
        err.statusCode = 400;
        throw err;
    }
    const buffer = await safeFetch.readLimitedArrayBuffer(response, safeFetch.DEFAULT_MAX_BYTES);
    return { buffer, contentType };
}

async function getAllIcons(db) {
    const icons = [];

    const uploadedIcons = await db.queryAll(`
        SELECT id, name, data, type, created_at
        FROM icon_library
        ORDER BY created_at DESC
    `);

    uploadedIcons.forEach(icon => {
        icons.push({
            id: icon.id,
            data: icon.data,
            type: icon.type,
            source: icon.name || '手动上传',
            uploaded: true
        });
    });

    const bookmarkIcons = await db.queryAll(`
        SELECT DISTINCT icon_data, icon_type, name
        FROM bookmarks
        WHERE icon_type IN ('base64', 'url') AND icon_data IS NOT NULL AND icon_data != ''
    `);

    const engineIcons = await db.queryAll(`
        SELECT DISTINCT icon, name
        FROM search_engines
        WHERE icon IS NOT NULL AND icon != '' AND (icon LIKE 'http%' OR icon LIKE 'data:%')
    `);

    const seenData = new Set(uploadedIcons.map(icon => icon.data).filter(Boolean));

    bookmarkIcons.forEach(b => {
        if (b.icon_data && !seenData.has(b.icon_data)) {
            seenData.add(b.icon_data);
            icons.push({
                data: b.icon_data,
                type: b.icon_type,
                source: b.name,
                uploaded: false
            });
        }
    });

    engineIcons.forEach(e => {
        if (e.icon && !seenData.has(e.icon)) {
            seenData.add(e.icon);
            icons.push({
                data: e.icon,
                type: e.icon.startsWith('data:') ? 'base64' : 'url',
                source: e.name,
                uploaded: false
            });
        }
    });

    return icons;
}

async function uploadIcon(db, { name, data, type }) {
    const iconId = newId('icon');
    await db.execute(
        'INSERT INTO icon_library (id, name, data, type) VALUES (?, ?, ?, ?)',
        [iconId, name || '', data, type || 'base64']
    );
    return { id: iconId };
}

async function uploadIconFromUrl(db, { url, name }, _assertSafeFetchUrl) {
    const { buffer, contentType } = await fetchLimitedImage(url);
    const base64 = Buffer.from(buffer).toString('base64');
    const data = `data:${contentType.split(';')[0]};base64,${base64}`;

    const iconId = newId('icon');
    await db.execute(
        'INSERT INTO icon_library (id, name, data, type) VALUES (?, ?, ?, ?)',
        [iconId, name || url, data, 'base64']
    );
    return { id: iconId, data };
}

async function deleteIcon(db, id) {
    await db.execute('DELETE FROM icon_library WHERE id = ?', [id]);
}

async function batchDeleteIcons(db, ids) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await db.execute(`DELETE FROM icon_library WHERE id IN (${placeholders})`, ids);
}

async function clearIconFromBookmarks(db, iconData) {
    await db.execute(
        "UPDATE bookmarks SET icon_data = '', icon_type = 'auto' WHERE icon_data = ?",
        [iconData]
    );
}

async function batchClearIconsFromBookmarks(db, iconDataList) {
    if (!Array.isArray(iconDataList) || iconDataList.length === 0) return;
    for (const iconData of iconDataList) {
        await db.execute(
            "UPDATE bookmarks SET icon_data = '', icon_type = 'auto' WHERE icon_data = ?",
            [iconData]
        );
    }
}

module.exports = {
    getAllIcons,
    uploadIcon,
    uploadIconFromUrl,
    deleteIcon,
    batchDeleteIcons,
    clearIconFromBookmarks,
    batchClearIconsFromBookmarks
};
