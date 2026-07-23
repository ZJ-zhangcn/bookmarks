const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const helperPath = path.join(__dirname, '../frontend/modules/global-search-helpers.cjs');
const {
  normalizeQuery,
  matchesBookmark,
  buildGlobalSearchModel
} = require(helperPath);

test('exports only the global-search pure model API', () => {
  assert.deepEqual(
    Object.keys(require(helperPath)).sort(),
    ['buildGlobalSearchModel', 'matchesBookmark', 'normalizeQuery']
  );
});

test('normalizes query whitespace without changing the web-search text', () => {
  assert.equal(normalizeQuery('  AGENT  '), 'AGENT');
  assert.equal(normalizeQuery(null), '');
});

test('matches AGENT case-insensitively in bookmark name, url, description, and tags', () => {
  const bookmarks = [
    { id: 'name', name: 'Hermes AGENT', url: 'https://name.example' },
    { id: 'url', name: 'URL', url: 'https://example.com/agents' },
    { id: 'description', name: 'Description', url: 'https://description.example', description: 'An autonomous Agent workflow' },
    { id: 'tags', name: 'Tags', url: 'https://tags.example', tags: ['research', 'AGENT'] },
    { id: 'miss', name: 'Other', url: 'https://other.example', description: 'unrelated', tags: ['misc'] }
  ];

  assert.deepEqual(
    buildGlobalSearchModel({
      bookmarks,
      query: 'AGENT',
      engine: { name: 'Google', url: 'https://google.example?q=' }
    }).bookmarks.map(bookmark => bookmark.id),
    ['name', 'url', 'description', 'tags']
  );
  assert.equal(matchesBookmark({ tags: 'Agent' }, 'agent'), true);
  assert.equal(matchesBookmark({ name: null, url: {}, description: undefined, tags: [null, 3, {}] }, 'agent'), false);
});

test('keeps source order and limits local bookmark matches to 12 by default', () => {
  const bookmarks = Array.from({ length: 14 }, (_, index) => ({
    id: `bookmark-${index + 1}`,
    name: `Agent ${index + 1}`
  }));

  const model = buildGlobalSearchModel({
    bookmarks,
    query: 'agent',
    engine: { name: 'Google', url: 'https://google.example?q=' }
  });

  assert.deepEqual(
    model.bookmarks.map(bookmark => bookmark.id),
    Array.from({ length: 12 }, (_, index) => `bookmark-${index + 1}`)
  );
});

test('returns no local results or web action for empty and whitespace-only queries', () => {
  const options = {
    bookmarks: [{ id: 'a', name: 'Hermes Agent' }],
    engine: { name: 'Google', url: 'https://google.example?q=' }
  };

  for (const query of ['', '   \n\t  ']) {
    assert.deepEqual(buildGlobalSearchModel({ ...options, query }), {
      bookmarks: [],
      web: null
    });
  }
});

test('builds a current-engine web action from a normalized query with encoded special characters', () => {
  assert.deepEqual(
    buildGlobalSearchModel({
      bookmarks: [],
      query: '  C++ & Node/JS  ',
      engine: { name: 'DuckDuckGo', url: 'https://search.example/?q=' }
    }).web,
    {
      name: 'DuckDuckGo',
      url: 'https://search.example/?q=C%2B%2B%20%26%20Node%2FJS'
    }
  );
});

test('builds results without mutating bookmark tags or the active engine', () => {
  const bookmarks = [
    {
      id: 'agent',
      name: 'Agent research',
      url: 'https://agent.example',
      tags: ['research', 'AGENT'],
      details: { source: 'manual' }
    },
    {
      id: 'other',
      name: 'Other',
      url: 'https://other.example',
      tags: ['misc']
    }
  ];
  const engine = {
    name: 'DuckDuckGo',
    url: 'https://search.example/?q=',
    settings: { region: 'us-en' }
  };
  const bookmarksBeforeSearch = structuredClone(bookmarks);
  const engineBeforeSearch = structuredClone(engine);

  const model = buildGlobalSearchModel({
    bookmarks,
    query: '  agent  ',
    engine
  });

  assert.deepEqual(model, {
    bookmarks: [bookmarks[0]],
    web: {
      name: 'DuckDuckGo',
      url: 'https://search.example/?q=agent'
    }
  });
  assert.deepEqual(bookmarks, bookmarksBeforeSearch);
  assert.deepEqual(engine, engineBeforeSearch);
});

test('contains no browser or HTML rendering operations', () => {
  const source = fs.readFileSync(helperPath, 'utf8');
  assert.doesNotMatch(source, /\bwindow\b/);
  assert.doesNotMatch(source, /\binnerHTML\b/);
  assert.doesNotMatch(source, /window\.open/);
});
