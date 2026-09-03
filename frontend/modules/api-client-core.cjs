class ApiRequestError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'ApiRequestError';
        this.status = options.status || 0;
        this.code = options.code || 'API_REQUEST_FAILED';
        this.details = options.details || null;
        this.isTimeout = Boolean(options.isTimeout);
        this.cause = options.cause;
    }
}

function wait(delayMs) {
    return new Promise(resolve => globalThis.setTimeout(resolve, delayMs));
}

function isSafeMethod(method) {
    return method === 'GET' || method === 'HEAD';
}

function shouldRetry(error, method) {
    if (!isSafeMethod(method)) return false;
    if (error.isTimeout || error.status === 408 || error.status === 429) return true;
    return error.status === 0 || error.status >= 500;
}

async function parseJsonResponse(response) {
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch (cause) {
        throw new ApiRequestError('服务器返回了非 JSON 响应', {
            status: response.status,
            code: 'INVALID_JSON_RESPONSE',
            cause
        });
    }
}

async function requestJson(url, options = {}) {
    const {
        fetchImpl = globalThis.fetch,
        baseUrl = '',
        timeoutMs = 10000,
        retries,
        retryDelayMs = 250,
        json,
        signal,
        ...fetchOptions
    } = options;
    if (typeof fetchImpl !== 'function') throw new ApiRequestError('当前环境不支持网络请求');

    const method = String(fetchOptions.method || 'GET').toUpperCase();
    const maxRetries = Number.isInteger(retries) ? Math.max(0, retries) : (isSafeMethod(method) ? 1 : 0);
    const requestUrl = /^https?:\/\//i.test(url) ? url : `${baseUrl}${url}`;
    const headers = new globalThis.Headers(fetchOptions.headers || {});
    let body = fetchOptions.body;
    if (json !== undefined) {
        headers.set('Content-Type', 'application/json');
        body = JSON.stringify(json);
    }

    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        const controller = new globalThis.AbortController();
        let didTimeout = false;
        const timeout = globalThis.setTimeout(() => {
            didTimeout = true;
            controller.abort();
        }, Math.max(1, timeoutMs));
        const abortFromCaller = () => controller.abort();
        signal?.addEventListener?.('abort', abortFromCaller, { once: true });

        try {
            const response = await fetchImpl(requestUrl, {
                ...fetchOptions,
                method,
                headers,
                body,
                credentials: fetchOptions.credentials || 'same-origin',
                signal: controller.signal
            });
            const payload = await parseJsonResponse(response);
            if (!response.ok || payload?.success === false) {
                throw new ApiRequestError(
                    payload?.error || payload?.message || `HTTP ${response.status}`,
                    {
                        status: response.status,
                        code: payload?.code || 'HTTP_ERROR',
                        details: payload
                    }
                );
            }
            return payload?.success === true && Object.prototype.hasOwnProperty.call(payload, 'data')
                ? payload.data
                : payload;
        } catch (error) {
            if (error instanceof ApiRequestError) {
                lastError = error;
            } else if (signal?.aborted && !didTimeout) {
                throw new ApiRequestError('请求已取消', { code: 'REQUEST_ABORTED', cause: error });
            } else {
                lastError = new ApiRequestError(didTimeout ? '请求超时' : (error.message || '网络请求失败'), {
                    code: didTimeout ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
                    isTimeout: didTimeout,
                    cause: error
                });
            }
        } finally {
            globalThis.clearTimeout(timeout);
            signal?.removeEventListener?.('abort', abortFromCaller);
        }

        if (attempt >= maxRetries || !shouldRetry(lastError, method)) throw lastError;
        await wait(retryDelayMs * (attempt + 1));
    }
    throw lastError;
}

async function withButtonPending(button, task, options = {}) {
    if (!button) return task();
    const originalDisabled = button.disabled;
    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.setAttribute?.('aria-busy', 'true');
    if (options.pendingText) button.textContent = options.pendingText;
    try {
        return await task();
    } finally {
        button.disabled = originalDisabled;
        button.removeAttribute?.('aria-busy');
        if (options.pendingText) button.innerHTML = originalHtml;
    }
}

module.exports = { ApiRequestError, requestJson, withButtonPending };
