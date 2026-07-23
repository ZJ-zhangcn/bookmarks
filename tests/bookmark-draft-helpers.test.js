const test = require('node:test');
const assert = require('node:assert/strict');

const helpers = require('../frontend/modules/bookmark-draft-helpers.cjs');
const {
  getHostnameFallback,
  buildQuickBookmarkDraft,
} = helpers;

test('bookmark draft helper exposes only its public API', () => {
  assert.deepEqual(Object.keys(helpers).sort(), [
    'buildQuickBookmarkDraft',
    'getHostnameFallback',
  ]);
});

test('getHostnameFallback strips a leading www prefix', () => {
  assert.equal(
    getHostnameFallback('https://www.example.com/docs'),
    'example.com',
  );
});

test('buildQuickBookmarkDraft accepts https URLs and derives a hostname name', () => {
  assert.deepEqual(
    buildQuickBookmarkDraft({
      url: '  https://www.example.com/docs  ',
      name: '   ',
    }),
    {
      ok: true,
      url: 'https://www.example.com/docs',
      name: 'example.com',
      categoryId: '__inbox__',
    },
  );
});

test('buildQuickBookmarkDraft accepts http URLs and preserves trimmed user values', () => {
  assert.deepEqual(
    buildQuickBookmarkDraft({
      url: ' http://example.org/path ',
      name: '  Reference site  ',
      categoryId: '  reading-list  ',
    }),
    {
      ok: true,
      url: 'http://example.org/path',
      name: 'Reference site',
      categoryId: 'reading-list',
    },
  );
});

test('buildQuickBookmarkDraft rejects empty URLs', () => {
  assert.deepEqual(
    buildQuickBookmarkDraft({ url: '   ' }),
    { ok: false, reason: 'invalid-url' },
  );
});

test('buildQuickBookmarkDraft rejects malformed and non-http URLs', () => {
  for (const url of ['example.com', 'ftp://example.com', 'not a url']) {
    assert.deepEqual(
      buildQuickBookmarkDraft({ url }),
      { ok: false, reason: 'invalid-url' },
    );
  }
});
