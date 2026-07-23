'use strict';

function trimInput(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getHostnameFallback(url) {
  const hostname = url instanceof globalThis.URL
    ? url.hostname
    : new globalThis.URL(url).hostname;

  return hostname.replace(/^www\./i, '');
}

function buildQuickBookmarkDraft({ url, name, categoryId } = {}) {
  const trimmedUrl = trimInput(url);
  let parsedUrl;

  try {
    parsedUrl = new globalThis.URL(trimmedUrl);
  } catch {
    return { ok: false, reason: 'invalid-url' };
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { ok: false, reason: 'invalid-url' };
  }

  const trimmedName = trimInput(name);
  const trimmedCategoryId = trimInput(categoryId);

  return {
    ok: true,
    url: trimmedUrl,
    name: trimmedName || getHostnameFallback(parsedUrl),
    categoryId: trimmedCategoryId || '__inbox__',
  };
}

module.exports = {
  getHostnameFallback,
  buildQuickBookmarkDraft,
};
