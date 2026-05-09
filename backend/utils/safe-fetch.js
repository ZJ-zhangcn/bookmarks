/**
 * Safe outbound HTTP helpers for user-supplied URLs.
 */
const dns = require('dns').promises;
const net = require('net');
const { Agent, fetch: undiciFetch } = require('undici');
const { assertSafeFetchUrl, assertPublicFetchUrl, isPrivateOrLocalAddress } = require('../middleware/security');

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

async function resolvePublicAddresses(hostname, allowPrivate = false) {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    const publicRecords = (records || []).filter(record => allowPrivate || !isPrivateOrLocalAddress(record.address));
    if (publicRecords.length === 0) {
        throw new Error('禁止访问解析到内网/本地地址的 URL');
    }
    return publicRecords;
}

function createPinnedDispatcher(hostname, resolvedRecord) {
    return new Agent({
        connect: {
            lookup(requestedHostname, options, callback) {
                if (String(requestedHostname).toLowerCase() !== String(hostname).toLowerCase()) {
                    callback(new Error('禁止重定向到未验证的主机'));
                    return;
                }
                if (options?.all) {
                    callback(null, [{ address: resolvedRecord.address, family: resolvedRecord.family }]);
                    return;
                }
                callback(null, resolvedRecord.address, resolvedRecord.family);
            }
        }
    });
}

async function safeFetchPublicUrl(rawUrl, options = {}) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let current = options.allowPrivate ? assertSafeFetchUrl(rawUrl) : await assertPublicFetchUrl(rawUrl);

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
        if (!options.allowPrivate && !net.isIP(current.hostname)) {
            await assertPublicFetchUrl(current.href);
        }
        const records = await resolvePublicAddresses(current.hostname, Boolean(options.allowPrivate));
        const dispatcher = createPinnedDispatcher(current.hostname, records[0]);
        let response;
        try {
            response = await undiciFetch(current.href, {
                ...(options.fetchOptions || {}),
                dispatcher,
                redirect: 'manual',
                signal: AbortSignal.timeout(timeoutMs)
            });
        } finally {
            await dispatcher.close();
        }

        if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
            const location = response.headers.get('location');
            current = options.allowPrivate
                ? assertSafeFetchUrl(new URL(location, current.href).href)
                : await assertPublicFetchUrl(new URL(location, current.href).href);
            continue;
        }
        return { response, url: current };
    }

    throw new Error('重定向次数过多');
}

async function readLimitedArrayBuffer(response, maxBytes = DEFAULT_MAX_BYTES) {
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > maxBytes) {
        const err = new Error('响应内容过大');
        err.statusCode = 413;
        throw err;
    }

    if (!response.body || typeof response.body.getReader !== 'function') {
        const err = new Error('响应流不可用');
        err.statusCode = 502;
        throw err;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBytes) {
                const err = new Error('响应内容过大');
                err.statusCode = 413;
                throw err;
            }
            chunks.push(Buffer.from(value));
        }
    } finally {
        reader.releaseLock();
    }
    return Buffer.concat(chunks, total);
}

module.exports = { safeFetchPublicUrl, readLimitedArrayBuffer, DEFAULT_MAX_BYTES };
