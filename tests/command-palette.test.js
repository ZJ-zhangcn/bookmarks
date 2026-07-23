const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const read = relPath => fs.readFileSync(path.join(root, relPath), 'utf8');

function createClassList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => values.delete(name)),
    contains: name => values.has(name)
  };
}

function createElement(document, id, tagName = 'DIV') {
  const attributes = new Map();
  return {
    id,
    tagName,
    isConnected: true,
    classList: createClassList(),
    style: {},
    value: '',
    innerHTML: '',
    focus() {
      document.activeElement = this;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) || null;
    },
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    scrollIntoView() {},
    closest: () => null
  };
}

function createPaletteAndSearchFixture() {
  const elements = new Map();
  const keydownListeners = [];
  const appended = [];
  const document = {
    activeElement: null,
    body: {
      style: {},
      appendChild(element) {
        element.isConnected = true;
        appended.push(element);
      }
    },
    getElementById: id => elements.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener(type, listener) {
      if (type === 'keydown') keydownListeners.push(listener);
    },
    createElement(tagName) {
      const element = createElement(document, '', String(tagName).toUpperCase());
      const input = createElement(document, '', 'INPUT');
      const list = createElement(document, '', 'DIV');
      element.querySelector = selector => {
        if (selector === '.command-palette-input') return input;
        if (selector === '.command-palette-list') return list;
        return null;
      };
      return element;
    }
  };

  const trigger = createElement(document, 'globalSearchTrigger', 'BUTTON');
  const input = createElement(document, 'globalSearchInput', 'INPUT');
  const close = createElement(document, 'globalSearchClose', 'BUTTON');
  const results = createElement(document, 'globalSearchResults');
  const overlay = createElement(document, 'globalSearchOverlay');
  overlay.querySelector = () => null;

  for (const element of [trigger, input, close, results, overlay]) {
    elements.set(element.id, element);
  }

  return {
    document,
    trigger,
    globalSearchOverlay: overlay,
    paletteOverlay: () => appended.at(-1),
    dispatchShortcut(key) {
      const event = {
        key,
        ctrlKey: true,
        metaKey: false,
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        }
      };
      keydownListeners.forEach(listener => listener(event));
      return event;
    }
  };
}

async function loadPaletteAndSearch(fixture) {
  global.window = {
    location: { origin: 'https://bookmarks.example', protocol: 'https:' },
    open: () => {}
  };
  global.document = fixture.document;
  global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  global.CSS = { escape: value => String(value) };
  global.requestAnimationFrame = callback => callback();

  const dom = await import(pathToFileURL(path.join(root, 'frontend/modules/dom.js')).href);
  dom.cacheDOMElements();
  const search = await import(pathToFileURL(path.join(root, 'frontend/modules/search.js')).href);
  const palette = await import(`${pathToFileURL(path.join(root, 'frontend/modules/command-palette.js')).href}?handoff-${Date.now()}`);
  return { search, palette };
}

test('command palette module is wired to keyboard shortcuts', () => {
  const events = read('frontend/modules/events.js');
  assert.match(events, /import\s+\{\s*initCommandPalette\s*\}\s+from\s+'\.\/command-palette\.js'/);
  assert.match(events, /initCommandPalette\s*\(/);
  assert.doesNotMatch(events, /Ctrl\/Cmd \+ K: Focus search/);

  const module = read('frontend/modules/command-palette.js');
  assert.match(module, /export\s+function\s+initCommandPalette/);
  assert.match(module, /Cmd\/Ctrl\+K/);
  assert.match(module, /command:\s*'add-bookmark'/);
  assert.match(module, /command:\s*'open-settings'/);
  assert.match(module, /command:\s*'open-todos'/);
});

test('command palette has accessible overlay styles', () => {
  const css = read('frontend/index.css');
  assert.match(css, /\.command-palette-overlay/);
  assert.match(css, /\.command-palette-panel/);
  assert.match(css, /\.command-palette-item\.active/);
});

test('command palette shortcuts hand off cleanly with the real global search overlay', async () => {
  const fixture = createPaletteAndSearchFixture();
  fixture.document.activeElement = fixture.trigger;
  const { search, palette } = await loadPaletteAndSearch(fixture);
  palette.initCommandPalette({ openGlobalSearch: search.openGlobalSearch });

  search.openGlobalSearch();
  const openPalette = fixture.dispatchShortcut('k');

  assert.equal(openPalette.defaultPrevented, true);
  assert.equal(fixture.globalSearchOverlay.classList.contains('open'), false);
  assert.equal(fixture.paletteOverlay().classList.contains('open'), true);
  assert.equal(fixture.document.body.style.overflow, 'hidden');

  const openSearch = fixture.dispatchShortcut('f');

  assert.equal(openSearch.defaultPrevented, true);
  assert.equal(fixture.paletteOverlay().classList.contains('open'), false);
  assert.equal(fixture.globalSearchOverlay.classList.contains('open'), true);
  assert.equal(fixture.document.body.style.overflow, 'hidden');
});
