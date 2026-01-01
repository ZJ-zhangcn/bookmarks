/**
 * 搜索联想模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { escapeHtml } from './utils.js';

const API_BASE = window.location.origin;
let suggestionsEl = null;
let currentSuggestions = [];
let selectedIndex = -1;
let debounceTimer = null;
let abortController = null;
let initialized = false;

export function initSearchSuggestions() {
    if (initialized) return;
    suggestionsEl = document.getElementById('searchSuggestions');
    if (!suggestionsEl || !DOM.webSearchInput) return;

    DOM.webSearchInput.addEventListener('input', handleInput);
    DOM.webSearchInput.addEventListener('keydown', handleKeydown);
    DOM.webSearchInput.addEventListener('blur', () => setTimeout(hide, 200));
    suggestionsEl.addEventListener('click', handleClick);
    initialized = true;
}

function handleInput(e) {
    const q = e.target.value.trim();
    clearTimeout(debounceTimer);
    if (abortController) abortController.abort();
    if (!q) { hide(); return; }
    debounceTimer = setTimeout(() => fetchSuggestions(q), 150);
}

async function fetchSuggestions(q) {
    if (abortController) abortController.abort();
    abortController = new AbortController();
    try {
        const engineName = state.currentEngine?.name?.toLowerCase() || '';
        let engine = 'baidu';
        if (engineName.includes('google')) engine = 'google';
        else if (engineName.includes('bing')) engine = 'bing';

        const res = await fetch(`${API_BASE}/api/suggest?q=${encodeURIComponent(q)}&engine=${engine}`, {
            signal: abortController.signal
        });
        if (!res.ok) { hide(); return; }
        const data = await res.json();

        if (DOM.webSearchInput.value.trim() !== q) return;
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
            currentSuggestions = data.data;
            selectedIndex = -1;
            render();
        } else {
            hide();
        }
    } catch (e) {
        if (e.name !== 'AbortError') hide();
    }
}

function render() {
    if (!suggestionsEl || currentSuggestions.length === 0) return;
    suggestionsEl.innerHTML = currentSuggestions.map((text, i) => `
        <div class="suggestion-item${i === selectedIndex ? ' active' : ''}" data-index="${i}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
            </svg>
            <span class="suggestion-text">${escapeHtml(text)}</span>
        </div>
    `).join('');
    suggestionsEl.classList.add('active');
}

function hide() {
    if (suggestionsEl) suggestionsEl.classList.remove('active');
    currentSuggestions = [];
    selectedIndex = -1;
}

function handleKeydown(e) {
    if (!suggestionsEl?.classList.contains('active')) return;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, currentSuggestions.length - 1);
        updateHighlight();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        updateHighlight();
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        select(selectedIndex);
    } else if (e.key === 'Escape') {
        hide();
    }
}

function updateHighlight() {
    if (!suggestionsEl) return;
    suggestionsEl.querySelectorAll('.suggestion-item').forEach((item, i) => {
        item.classList.toggle('active', i === selectedIndex);
    });
}

function handleClick(e) {
    const item = e.target.closest('.suggestion-item');
    if (item) select(parseInt(item.dataset.index, 10));
}

function select(index) {
    if (index >= 0 && index < currentSuggestions.length) {
        const text = currentSuggestions[index];
        DOM.webSearchInput.value = text;
        hide();
        window.open(state.currentEngine.url + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
        DOM.webSearchInput.value = '';
    }
}

