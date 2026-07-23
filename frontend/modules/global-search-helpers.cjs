function normalizeQuery(query) {
  return typeof query === 'string' ? query.trim() : '';
}

function matchesBookmark(bookmark, query) {
  const normalizedQuery = normalizeQuery(query).toLowerCase();
  if (!normalizedQuery || !bookmark || typeof bookmark !== 'object') return false;

  const tags = Array.isArray(bookmark.tags) ? bookmark.tags : [bookmark.tags];
  const fields = [bookmark.name, bookmark.url, bookmark.description, ...tags];

  return fields.some(field => (
    typeof field === 'string' && field.toLowerCase().includes(normalizedQuery)
  ));
}

function buildGlobalSearchModel(options = {}) {
  const { bookmarks, query, engine, limit = 12 } = options || {};
  const normalizedQuery = normalizeQuery(query);

  if (!normalizedQuery) {
    return { bookmarks: [], web: null };
  }

  const resultLimit = Number.isInteger(limit) && limit >= 0 ? limit : 12;
  const matchedBookmarks = (Array.isArray(bookmarks) ? bookmarks : [])
    .filter(bookmark => matchesBookmark(bookmark, normalizedQuery))
    .slice(0, resultLimit);
  const activeEngine = engine && typeof engine === 'object' ? engine : {};

  return {
    bookmarks: matchedBookmarks,
    web: {
      name: typeof activeEngine.name === 'string' ? activeEngine.name : '',
      url: `${typeof activeEngine.url === 'string' ? activeEngine.url : ''}${encodeURIComponent(normalizedQuery)}`
    }
  };
}

module.exports = { normalizeQuery, matchesBookmark, buildGlobalSearchModel };
