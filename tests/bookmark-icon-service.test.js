const test = require('node:test');
const assert = require('node:assert/strict');

const { createBookmarkIconService } = require('../backend/services/icons/bookmark-icon-service');

function createFakeDb({ urlIcons = [], missingIcons = [] } = {}) {
    const updates = [];
    return {
        updates,
        async queryAll(sql) {
            if (sql.includes("icon_type = 'url'")) return urlIcons;
            if (sql.includes("icon_type = 'auto'") || sql.includes('icon_data IS NULL')) return missingIcons;
            return [];
        },
        async execute(sql, params) {
            updates.push({ sql, params });
        }
    };
}

test('convertUrlIconsToBase64 converts URL icons and records failures without aborting', async () => {
    const db = createFakeDb({
        urlIcons: [
            { id: 'ok', icon_data: 'https://example.com/ok.png' },
            { id: 'bad', icon_data: 'https://example.com/bad.png' }
        ]
    });
    const service = createBookmarkIconService(db, {
        fetchPublicImageAsDataUrl: async url => {
            if (url.includes('bad')) throw new Error('network down');
            return 'data:image/png;base64,b2s=';
        }
    });

    const result = await service.convertUrlIconsToBase64();

    assert.equal(result.fixed, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.total, 2);
    assert.deepEqual(result.failures, [{ id: 'bad', reason: 'network down' }]);
    assert.deepEqual(db.updates[0].params, ['base64', 'data:image/png;base64,b2s=', 'ok']);
});

test('fetchMissingBookmarkIcons uses the first discovered icon and records missing failures', async () => {
    const db = createFakeDb({
        missingIcons: [
            { id: 'ok', url: 'https://example.com/page' },
            { id: 'empty', url: 'https://empty.example/page' }
        ]
    });
    const service = createBookmarkIconService(db, {
        iconDiscovery: {
            discoverIcons: async url => url.includes('empty')
                ? { icons: [] }
                : { icons: ['https://example.com/favicon.png'] }
        },
        fetchPublicImageAsDataUrl: async url => {
            assert.equal(url, 'https://example.com/favicon.png');
            return 'data:image/png;base64,aWNvbg==';
        }
    });

    const result = await service.fetchMissingBookmarkIcons();

    assert.equal(result.fetched, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.total, 2);
    assert.deepEqual(result.failures, [{ id: 'empty', reason: '未找到可用图标' }]);
    assert.deepEqual(db.updates[0].params, ['base64', 'data:image/png;base64,aWNvbg==', 'ok']);
});
