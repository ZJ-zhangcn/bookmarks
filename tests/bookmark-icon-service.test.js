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

test('fetchMissingBookmarkIcons uses icon.horse letter fallback when no site icon is valid', async () => {
    const db = createFakeDb({
        missingIcons: [
            { id: 'placeholder', url: 'https://placeholder.example/page' }
        ]
    });
    let imageFetchCalls = 0;
    const service = createBookmarkIconService(db, {
        iconDiscovery: {
            discoverIcons: async () => ({
                status: 'fallback',
                icons: [
                    'https://www.google.com/s2/favicons?domain=placeholder.example&sz=64',
                    'https://favicon.im/placeholder.example',
                    'https://icon.horse/icon/placeholder.example'
                ],
                candidates: [
                    {
                        url: 'https://www.google.com/s2/favicons?domain=placeholder.example&sz=64',
                        source: 'google',
                        type: 'provider',
                        usable: false,
                        reason: 'no-validated-icons'
                    },
                    {
                        url: 'https://favicon.im/placeholder.example',
                        source: 'faviconim',
                        type: 'provider',
                        usable: false,
                        reason: 'no-validated-icons'
                    },
                    {
                        url: 'https://icon.horse/icon/placeholder.example',
                        source: 'icon-horse',
                        type: 'provider',
                        usable: false,
                        reason: 'no-validated-icons'
                    }
                ]
            })
        },
        fetchPublicImageAsDataUrl: async url => {
            imageFetchCalls += 1;
            assert.equal(url, 'https://icon.horse/icon/placeholder.example');
            return 'data:image/png;base64,aWNvbi1ob3JzZQ==';
        }
    });

    const result = await service.fetchMissingBookmarkIcons();

    assert.equal(result.fetched, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.total, 1);
    assert.equal(imageFetchCalls, 1);
    assert.deepEqual(result.failures, []);
    assert.deepEqual(db.updates[0].params, ['base64', 'data:image/png;base64,aWNvbi1ob3JzZQ==', 'placeholder']);
});
