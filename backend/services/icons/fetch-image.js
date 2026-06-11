const { AppError } = require('../../utils');
const { safeFetch } = require('../../utils/safe-fetch');

const IMAGE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'image/*,*/*;q=0.8'
};

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2MB

async function readLimitedArrayBuffer(response, maxBytes = DEFAULT_MAX_BYTES) {
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > maxBytes) {
        throw new AppError('图片过大', 413);
    }

    return buffer;
}

async function safeFetchPublicUrl(url, options = {}) {
    const fetchImpl = options.safeFetch || safeFetch;
    const response = await fetchImpl(url, {
        timeout: options.timeoutMs || 10000,
        headers: options.fetchOptions?.headers || {}
    });

    return { response, url };
}

async function fetchPublicImage(url, options = {}) {
    const fetchImpl = options.safeFetch || safeFetch;
    const response = await fetchImpl(url, {
        timeout: options.timeoutMs || 10000,
        headers: {
            ...IMAGE_HEADERS,
            ...(options.headers || {})
        }
    });

    if (!response.ok) {
        throw new AppError(`上游返回 ${response.status}`, 502);
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    if (!contentType.startsWith('image/')) {
        throw new AppError('上游不是图片内容', 502);
    }

    const buffer = await readLimitedArrayBuffer(response, options.maxBytes || DEFAULT_MAX_BYTES);
    return {
        buffer,
        contentType,
        finalUrl: response.url || url
    };
}

async function fetchPublicImageAsDataUrl(url, options = {}) {
    const { buffer, contentType } = await fetchPublicImage(url, options);
    return `data:${contentType.split(';')[0]};base64,${buffer.toString('base64')}`;
}

module.exports = {
    IMAGE_HEADERS,
    DEFAULT_MAX_BYTES,
    fetchPublicImage,
    fetchPublicImageAsDataUrl,
    safeFetchPublicUrl,
    readLimitedArrayBuffer
};
