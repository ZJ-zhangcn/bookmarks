/**
 * 个性化设置模块：外观配置、壁纸与时钟。
 * 从 settings.js 拆出，保持原有导出供延迟加载入口使用。
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { apiRequest, runWithButton } from './api-client.js';
import { preloadImage, toSafeImageUrl } from './utils.js';
import { showToast } from './ux.js';

const WALLPAPER_HINT_KEY = 'wallpaper:lastOkUrl';
const WALLPAPER_TONE_ATTR = 'data-wallpaper-tone';
const INITIAL_WALLPAPER_WAIT_MS = 5000;
let wallpaperLoadSeq = 0;

export function getWallpaperToneFromLuminance(luminance, dimPercent = 30) {
    const value = Number(luminance);
    if (!Number.isFinite(value)) return '';
    const dim = Math.min(0.85, Math.max(0, Number(dimPercent) || 0) / 100);
    const perceived = Math.max(0, Math.min(1, value)) * (1 - dim);
    return perceived >= 0.48 ? 'light' : 'dark';
}

function sampleImageLuminance(img) {
    const canvas = document.createElement('canvas');
    const size = 32;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    let total = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3] / 255;
        if (alpha <= 0.05) continue;
        total += ((0.2126 * data[i]) + (0.7152 * data[i + 1]) + (0.0722 * data[i + 2])) / 255;
        count += 1;
    }
    return count ? total / count : null;
}

function setWallpaperTone(tone, luminance) {
    const root = document.documentElement;
    if (!tone) {
        root.removeAttribute(WALLPAPER_TONE_ATTR);
        root.style.removeProperty('--wallpaper-luminance');
        return;
    }
    root.setAttribute(WALLPAPER_TONE_ATTR, tone);
    if (Number.isFinite(luminance)) {
        root.style.setProperty('--wallpaper-luminance', luminance.toFixed(3));
    }
}

function detectWallpaperTone(displayUrl, dimPercent, seq) {
    const fallbackTone = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    setWallpaperTone(fallbackTone, NaN);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
        if (seq !== wallpaperLoadSeq) return;
        try {
            const luminance = sampleImageLuminance(img);
            const tone = getWallpaperToneFromLuminance(luminance, dimPercent);
            if (tone) setWallpaperTone(tone, luminance);
        } catch {
            // 跨域图片如果不允许 canvas 采样，就保留主题 fallback，避免闪烁。
        }
    };
    img.onerror = () => {
        if (seq === wallpaperLoadSeq) setWallpaperTone('', NaN);
    };
    img.src = displayUrl;
}

function loadImageAndDecode(url, timeoutMs) {
    const src = String(url || '').trim();
    if (!src) return Promise.resolve(false);
    return new Promise(resolve => {
        const img = new Image();
        let done = false;
        const finish = (ok) => {
            if (done) return;
            done = true;
            resolve(ok);
        };
        const timer = setTimeout(() => finish(false), timeoutMs);
        img.onload = () => {
            const maybeDecode = typeof img.decode === 'function' ? img.decode() : null;
            Promise.resolve(maybeDecode)
                .catch(() => { })
                .finally(() => {
                    clearTimeout(timer);
                    finish(true);
                });
        };
        img.onerror = () => {
            clearTimeout(timer);
            finish(false);
        };
        img.src = src;
    });
}

export async function loadPersonalization(options = {}) {
    try {
        let config;
        if (state.personalizationConfig !== undefined) {
            config = state.personalizationConfig;
        } else {
            config = await apiRequest('/api/config', {}, { toast: false });
            state.setPersonalizationConfig(config);
        }

        if (config) {
            if (DOM.logoShow) DOM.logoShow.checked = config.logoShow !== false;
            if (DOM.logoText) DOM.logoText.value = config.logoText || '书签导航';
            if (DOM.clockShow) DOM.clockShow.checked = config.clockShow || false;
            if (DOM.searchBarShow) DOM.searchBarShow.checked = config.searchBarShow !== false;
            if (DOM.wallpaperUrl) DOM.wallpaperUrl.value = config.wallpaperUrl || '';
            if (DOM.wallpaperBlur) DOM.wallpaperBlur.value = config.wallpaperBlur || 0;
            if (DOM.wallpaperBlurValue) DOM.wallpaperBlurValue.textContent = (config.wallpaperBlur || 0) + 'px';
            if (DOM.wallpaperDim) DOM.wallpaperDim.value = config.wallpaperDim || 30;
            if (DOM.wallpaperDimValue) DOM.wallpaperDimValue.textContent = (config.wallpaperDim || 30) + '%';
            if (DOM.contentMaxWidth) DOM.contentMaxWidth.value = config.contentMaxWidth || 1200;
            if (DOM.footerShow) DOM.footerShow.checked = config.footerShow !== false;
            if (DOM.footerText) DOM.footerText.value = config.footerText || '© 2024 书签导航 · 快捷访问常用网站';
            await applyPersonalization(config, options);
        }
    } catch (e) {
        console.error('加载个性化设置失败:', e);
    }
}

export async function savePersonalization() {
    const config = {
        logoShow: DOM.logoShow ? DOM.logoShow.checked : true,
        logoText: DOM.logoText ? DOM.logoText.value : '书签导航',
        clockShow: DOM.clockShow ? DOM.clockShow.checked : false,
        searchBarShow: DOM.searchBarShow ? DOM.searchBarShow.checked : true,
        wallpaperUrl: DOM.wallpaperUrl ? DOM.wallpaperUrl.value : '',
        wallpaperBlur: DOM.wallpaperBlur ? parseInt(DOM.wallpaperBlur.value) : 0,
        wallpaperDim: DOM.wallpaperDim ? parseInt(DOM.wallpaperDim.value) : 30,
        contentMaxWidth: DOM.contentMaxWidth ? parseInt(DOM.contentMaxWidth.value) : 1200,
        footerShow: DOM.footerShow ? DOM.footerShow.checked : true,
        footerText: DOM.footerText ? DOM.footerText.value : '© 2024 书签导航 · 快捷访问常用网站'
    };

    return runWithButton(DOM.savePersonalization, async () => {
        try {
            await apiRequest('/api/config', {
                method: 'POST',
                json: config
            }, { toast: false });
            state.setPersonalizationConfig(config);
            await applyPersonalization(config);
            showToast('保存成功', 'success');
        } catch (e) {
            showToast('保存失败: ' + e.message, 'error');
        }
    }, '保存中...');
}

export async function applyPersonalization(config, options = {}) {
    const logo = document.querySelector('.site-title');
    if (logo) {
        logo.style.display = config.logoShow ? '' : 'none';
        logo.textContent = config.logoText || '书签导航';
    }

    if (DOM.webSearchContainer) {
        DOM.webSearchContainer.style.display = config.searchBarShow !== false ? '' : 'none';
    }

    if (DOM.clockContainer) {
        DOM.clockContainer.style.display = config.clockShow ? 'block' : 'none';
        if (config.clockShow) {
            startClock();
        }
    }

    const wallpaperLayer = document.getElementById('wallpaperLayer');
    const wallpaperImage = document.getElementById('wallpaperImage');
    const wallpaperOverlay = document.getElementById('wallpaperOverlay');
    const bgDecoration = document.getElementById('bgDecoration');

    if (config.wallpaperUrl) {
        const url = String(config.wallpaperUrl || '').trim();
        const displayUrl = toSafeImageUrl(url, { preferProxyHosts: false });
        const seq = ++wallpaperLoadSeq;

        const blur = config.wallpaperBlur || 0;
        wallpaperOverlay.style.backdropFilter = `blur(${blur}px)`;
        wallpaperOverlay.style.webkitBackdropFilter = `blur(${blur}px)`;

        const dim = config.wallpaperDim || 30;
        wallpaperOverlay.style.background = `rgba(0, 0, 0, ${dim / 100})`;

        if (bgDecoration) bgDecoration.style.display = '';

        const hinted = (localStorage.getItem(WALLPAPER_HINT_KEY) || '') === url;
        const applySuccess = () => {
            if (seq !== wallpaperLoadSeq) return;
            wallpaperLayer.classList.add('active');
            wallpaperImage.style.backgroundImage = `url(${displayUrl})`;
            if (bgDecoration) bgDecoration.style.display = 'none';
            localStorage.setItem(WALLPAPER_HINT_KEY, url);
            detectWallpaperTone(displayUrl, dim, seq);
        };
        const applyFailure = () => {
            if (seq !== wallpaperLoadSeq) return;
            wallpaperLayer.classList.remove('active');
            wallpaperImage.style.backgroundImage = '';
            setWallpaperTone('', NaN);
            if (bgDecoration) bgDecoration.style.display = '';
        };

        const waitForWallpaper = options && options.waitForWallpaper === true;
        const avoidLateSwap = options && options.avoidLateWallpaperSwap === true;

        if (waitForWallpaper) {
            const ok = await loadImageAndDecode(displayUrl, hinted ? 1500 : INITIAL_WALLPAPER_WAIT_MS);
            if (ok) {
                applySuccess();
            } else {
                applyFailure();
                if (!avoidLateSwap) {
                    const img = new Image();
                    img.onload = applySuccess;
                    img.onerror = applyFailure;
                    img.src = displayUrl;
                } else {
                    // 背景加载成功则仅写入 hint，避免本次加载出现“后到的壁纸”闪切
                    const img = new Image();
                    img.onload = () => {
                        if (seq !== wallpaperLoadSeq) return;
                        localStorage.setItem(WALLPAPER_HINT_KEY, url);
                    };
                    img.src = displayUrl;
                }
            }
        } else if (hinted) {
            applySuccess();
            const img = new Image();
            img.onload = applySuccess;
            img.onerror = applyFailure;
            img.src = displayUrl;
        } else {
            const ok = await preloadImage(displayUrl, 1500);
            if (ok) {
                applySuccess();
            } else {
                applyFailure();
                const img = new Image();
                img.onload = applySuccess;
                img.onerror = applyFailure;
                img.src = displayUrl;
            }
        }

        document.body.style.backgroundImage = '';
    } else {
        wallpaperLayer.classList.remove('active');
        wallpaperImage.style.backgroundImage = '';
        setWallpaperTone('', NaN);

        if (bgDecoration) bgDecoration.style.display = '';

        document.body.style.backgroundImage = '';
    }

    const container = document.querySelector('.container');
    if (container) container.style.maxWidth = (config.contentMaxWidth || 1200) + 'px';

    if (DOM.footer) {
        DOM.footer.style.display = config.footerShow !== false ? '' : 'none';
        const footerP = DOM.footer.querySelector('p');
        if (footerP) {
            footerP.textContent = config.footerText || '© 2024 书签导航 · 快捷访问常用网站';
        }
    }
}

function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    if (DOM.clockTime) {
        DOM.clockTime.textContent = `${hours}:${minutes}`;
    }

    if (DOM.clockDate) {
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        const month = now.getMonth() + 1;
        const date = now.getDate();
        const weekday = weekdays[now.getDay()];
        DOM.clockDate.textContent = `${month}-${date} 星期${weekday}`;
    }
}

export function startClock() {
    if (state.clockInterval) return;
    updateClock();
    state.setClockInterval(setInterval(updateClock, 1000));
}
