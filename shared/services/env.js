function isTruthy(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function isFalsy(value) {
    return ['0', 'false', 'no', 'off'].includes(String(value || '').trim().toLowerCase());
}

function hasEnv(name) {
    return Object.prototype.hasOwnProperty.call(process.env, name);
}

function getAuthMode() {
    return String(process.env.AUTH_MODE || '').trim().toLowerCase();
}

function isAdminAuthDisabled() {
    const authMode = getAuthMode();
    if (['off', 'disabled', 'none'].includes(authMode)) return true;
    if (authMode === 'token') return false;
    return isTruthy(process.env.DISABLE_ADMIN_AUTH || process.env.DISABLE_AUTH);
}

function isAnonymousWriteAllowed() {
    const authMode = getAuthMode();
    if (['off', 'disabled', 'none', 'anonymous'].includes(authMode)) return true;
    if (authMode === 'token') return false;
    return isTruthy(process.env.ALLOW_ANONYMOUS_WRITE);
}

function isPrivateNetworkAllowed() {
    return isTruthy(process.env.ALLOW_PRIVATE_NETWORK);
}

function isPrivateFetchAllowed() {
    return isPrivateNetworkAllowed() || isTruthy(process.env.ALLOW_PRIVATE_FETCH);
}

function isPrivateAiBaseUrlAllowed() {
    return isPrivateNetworkAllowed() || isTruthy(process.env.AI_ALLOW_PRIVATE_BASE_URL);
}

function allowAiClientOverride(kind) {
    if (hasEnv('AI_CLIENT_OVERRIDES')) {
        return isTruthy(process.env.AI_CLIENT_OVERRIDES) && !isFalsy(process.env.AI_CLIENT_OVERRIDES);
    }

    const legacyByKind = {
        key: 'AI_ALLOW_CLIENT_KEY',
        baseUrl: 'AI_ALLOW_CLIENT_BASE_URL',
        provider: 'AI_ALLOW_CLIENT_PROVIDER',
        params: 'AI_ALLOW_CLIENT_PARAMS'
    };
    return isTruthy(process.env[legacyByKind[kind]]);
}

module.exports = {
    isTruthy,
    isAdminAuthDisabled,
    isAnonymousWriteAllowed,
    isPrivateNetworkAllowed,
    isPrivateFetchAllowed,
    isPrivateAiBaseUrlAllowed,
    allowAiClientOverride
};
