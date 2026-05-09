import * as state from './state.js';

export function getMonitorServerConfigs() {
    return Array.isArray(state.monitorServerConfigs) ? state.monitorServerConfigs : [];
}

export function findMonitorServerConfig(id) {
    return getMonitorServerConfigs().find(server => server.id === id) || null;
}

export function parseServerComponentType(componentType = '') {
    const value = String(componentType || '');
    if (value.startsWith('server:')) {
        return { isServer: true, serverId: value.slice('server:'.length) };
    }
    if (value === 'servers') {
        return { isServer: true, serverId: '' };
    }
    return { isServer: false, serverId: '' };
}
