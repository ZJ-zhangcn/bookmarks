const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('frontend declares service status cards and settings controls', () => {
  const html = read('frontend/index.html');

  assert.match(html, /id="serviceStatusContainer"/);
  assert.match(html, /id="serviceStatusRefresh"/);
  assert.match(html, /data-panel="service-status"/);
  assert.match(html, /id="serviceStatusName"/);
  assert.match(html, /id="serviceStatusUrl"/);
  assert.match(html, /id="serviceStatusEnabled"/);
  assert.match(html, /id="serviceStatusSaveBtn"/);
  assert.match(html, /id="serviceStatusList"/);
});

test('service status frontend module renders status cards and polls every 30 seconds', () => {
  const source = read('frontend/modules/service-status.js');

  assert.match(source, /export function renderServiceStatusCards/);
  assert.match(source, /export function initServiceStatusUi/);
  assert.match(source, /\/api\/service-status/);
  assert.match(source, /\/api\/service-status\/check/);
  assert.match(source, /30000/);
  assert.match(source, /正常/);
  assert.match(source, /异常/);
  assert.match(source, /未检查/);
});

test('state and DOM cache include service status fields', () => {
  const state = read('frontend/modules/state.js');
  const dom = read('frontend/modules/dom.js');

  assert.match(state, /export let serviceStatuses = \[\]/);
  assert.match(state, /export function setServiceStatuses/);
  assert.match(state, /export let serviceStatusInterval/);
  assert.match(state, /export let editingServiceStatusId = null/);
  assert.match(state, /export function setEditingServiceStatusId/);
  assert.match(dom, /serviceStatusContainer: document\.getElementById\('serviceStatusContainer'\)/);
  assert.match(dom, /serviceStatusList: document\.getElementById\('serviceStatusList'\)/);
});

test('main and events wire service status loading and configuration actions', () => {
  const main = read('frontend/main.js');
  const events = read('frontend/modules/events.js');

  assert.match(main, /initServiceStatusUi/);
  assert.match(events, /saveServiceStatusFromUi/);
  assert.match(events, /handleServiceStatusSettingsClick/);
  assert.match(events, /serviceStatusSaveBtn/);
  assert.match(events, /serviceStatusRefresh/);
  assert.match(read('frontend/modules/service-status.js'), /service-status-edit/);
});
