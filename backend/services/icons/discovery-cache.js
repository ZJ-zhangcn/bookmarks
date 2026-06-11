function defaultNow() {
    return new Date();
}

function isoDate(value) {
    return new Date(value).toISOString();
}

function isExpired(expiresAt, now) {
    return new Date(expiresAt).getTime() <= now.getTime();
}

function createIconDiscoveryCache(db, options = {}) {
    const now = options.now || defaultNow;

    async function get(origin) {
        const row = await db.queryOne(
            'SELECT origin, result_json, status, expires_at FROM icon_discovery_cache WHERE origin = ?',
            [origin]
        );
        if (!row) return null;

        if (isExpired(row.expires_at, now())) {
            await deleteEntry(origin);
            return null;
        }

        try {
            return JSON.parse(row.result_json);
        } catch {
            await deleteEntry(origin);
            return null;
        }
    }

    async function set(origin, result, ttlMs) {
        const expiresAt = isoDate(now().getTime() + ttlMs);
        await db.execute(`
            INSERT INTO icon_discovery_cache (origin, result_json, status, expires_at, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(origin) DO UPDATE SET
                result_json = excluded.result_json,
                status = excluded.status,
                expires_at = excluded.expires_at,
                updated_at = CURRENT_TIMESTAMP
        `, [
            origin,
            JSON.stringify(result),
            result?.status || '',
            expiresAt
        ]);
    }

    async function deleteEntry(origin) {
        await db.execute('DELETE FROM icon_discovery_cache WHERE origin = ?', [origin]);
    }

    async function pruneExpired(limit = 100) {
        const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 1000));
        const nowIso = isoDate(now());
        if (typeof db.queryAll === 'function') {
            const rows = await db.queryAll(
                'SELECT origin FROM icon_discovery_cache WHERE expires_at < ? ORDER BY expires_at ASC LIMIT ?',
                [nowIso, safeLimit]
            );
            for (const row of rows) {
                await deleteEntry(row.origin);
            }
            return rows.length;
        }
        await db.execute('DELETE FROM icon_discovery_cache WHERE expires_at < ?', [nowIso, safeLimit]);
        return undefined;
    }

    return {
        get,
        set,
        delete: deleteEntry,
        pruneExpired
    };
}

module.exports = { createIconDiscoveryCache };
