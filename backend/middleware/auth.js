const crypto = require('crypto');

const COOKIE_NAME = 'bookmark_nav_session';
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_IDLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isSessionAuthEnabled() {
    return ['session', 'cookie', 'password'].includes(String(process.env.AUTH_MODE || '').trim().toLowerCase());
}

function getConfig() {
    const ttl = Number(process.env.AUTH_SESSION_TTL_MS) || DEFAULT_TTL_MS;
    const idleTtl = Number(process.env.AUTH_SESSION_IDLE_TTL_MS) || DEFAULT_IDLE_TTL_MS;
    return {
        username: String(process.env.AUTH_USERNAME || 'admin').trim(),
        password: String(process.env.AUTH_PASSWORD || ''),
        secret: String(process.env.AUTH_SESSION_SECRET || process.env.ADMIN_TOKEN || '').trim(),
        ttl: Math.max(5 * 60 * 1000, ttl),
        idleTtl: Math.max(5 * 60 * 1000, Math.min(idleTtl, ttl))
    };
}

function timingSafeEqual(a, b) {
    const left = Buffer.from(String(a));
    const right = Buffer.from(String(b));
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function sign(value, secret) {
    return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function createSession(username, now = Date.now()) {
    const config = getConfig();
    if (!config.secret) throw new Error('未配置 AUTH_SESSION_SECRET');
    const payload = Buffer.from(JSON.stringify({
        u: username,
        iat: now,
        exp: now + config.ttl,
        idle: now + config.idleTtl
    })).toString('base64url');
    return `${payload}.${sign(payload, config.secret)}`;
}

function parseCookies(header) {
    return String(header || '').split(';').reduce((cookies, part) => {
        const index = part.indexOf('=');
        if (index < 0) return cookies;
        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (key) {
            try { cookies[key] = decodeURIComponent(value); } catch (_error) { /* ignore malformed cookie */ }
        }
        return cookies;
    }, {});
}

function verifySession(token, now = Date.now()) {
    const config = getConfig();
    if (!token || !config.secret) return null;
    const separator = token.lastIndexOf('.');
    if (separator < 1) return null;
    const payload = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    if (!timingSafeEqual(signature, sign(payload, config.secret))) return null;
    try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (data.u !== config.username || !Number.isFinite(data.exp) || !Number.isFinite(data.idle)
            || now > data.exp || now > data.idle) return null;
        return data;
    } catch (_error) {
        return null;
    }
}

function cookieOptions(req, maxAge) {
    const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
    const secure = String(process.env.AUTH_COOKIE_SECURE || '').toLowerCase() === 'true'
        || req.secure === true || forwardedProto === 'https';
    return [
        `${COOKIE_NAME}=`,
        `Max-Age=${Math.max(0, Math.floor(maxAge / 1000))}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        ...(secure ? ['Secure'] : [])
    ].join('; ');
}

function setSessionCookie(req, res, token, maxAge) {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieOptions(req, maxAge).split('; ').slice(1).join('; ')}`);
}

function clearSessionCookie(req, res) {
    res.setHeader('Set-Cookie', cookieOptions(req, 0));
}

function getSession(req) {
    return verifySession(parseCookies(req.headers?.cookie)[COOKIE_NAME]);
}

function requireSession(req, res, next) {
    if (!isSessionAuthEnabled()) return next();
    const session = getSession(req);
    if (!session) return res.status(401).json({ success: false, error: '需要登录', code: 'AUTH_REQUIRED' });
    req.auth = session;
    // Refresh active sessions so normal use does not require repeated logins.
    const config = getConfig();
    const now = Date.now();
    if (session.idle - now < config.idleTtl / 2) {
        setSessionCookie(req, res, createSession(session.u, now), config.ttl);
    }
    return next();
}

function registerAuthRoutes(app) {
    app.post('/api/auth/login', (req, res) => {
        if (!isSessionAuthEnabled()) return res.json({ success: true, data: { authenticated: true, required: false } });
        const config = getConfig();
        if (!config.password || !config.secret) {
            return res.status(503).json({ success: false, error: '服务端未配置 AUTH_PASSWORD 和 AUTH_SESSION_SECRET' });
        }
        const username = String(req.body?.username || '');
        const password = String(req.body?.password || '');
        if (!timingSafeEqual(username, config.username) || !timingSafeEqual(password, config.password)) {
            return res.status(401).json({ success: false, error: '账号或密码错误', code: 'INVALID_CREDENTIALS' });
        }
        setSessionCookie(req, res, createSession(config.username), config.ttl);
        return res.json({ success: true, data: { authenticated: true, expiresIn: config.ttl } });
    });

    app.post('/api/auth/logout', (req, res) => {
        clearSessionCookie(req, res);
        res.json({ success: true, data: { authenticated: false } });
    });

    app.get('/api/auth/session', (req, res) => {
        if (!isSessionAuthEnabled()) return res.json({ success: true, data: { authenticated: true, required: false } });
        const session = getSession(req);
        if (!session) return res.json({ success: true, data: { authenticated: false, required: true } });
        req.auth = session;
        const config = getConfig();
        if (session.idle - Date.now() < config.idleTtl / 2) {
            setSessionCookie(req, res, createSession(session.u), config.ttl);
        }
        return res.json({ success: true, data: { authenticated: true, required: true, username: session.u, expiresAt: session.exp } });
    });
}

module.exports = {
    COOKIE_NAME,
    isSessionAuthEnabled,
    requireSession,
    registerAuthRoutes,
    createSession,
    verifySession,
    parseCookies
};
