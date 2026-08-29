const test = require('node:test');
const assert = require('node:assert/strict');

const { createIconLoadQueue } = require('../frontend/modules/icon-load-queue.cjs');

test('icon load queue drains all unique ids in bounded batches', async () => {
    const batches = [];
    const resolved = new Set(['cached']);
    const queue = createIconLoadQueue({
        batchSize: 20,
        maxConcurrent: 1,
        isResolved: id => resolved.has(id),
        async loadBatch(ids) {
            batches.push([...ids]);
            return Object.fromEntries(ids.map(id => [id, { icon_data: `${id}.png` }]));
        },
        onResult(ids) {
            ids.forEach(id => resolved.add(id));
        }
    });

    const ids = Array.from({ length: 55 }, (_, index) => `bm-${index}`);
    queue.enqueue([...ids, 'bm-0', 'cached']);
    await queue.whenIdle();

    assert.deepEqual(batches.map(batch => batch.length), [20, 20, 15]);
    assert.equal(new Set(batches.flat()).size, 55);
    assert.equal(resolved.size, 56);
});

test('icon load queue retries failed batches without accepting duplicate in-flight ids', async () => {
    let calls = 0;
    const failed = [];
    const queue = createIconLoadQueue({
        batchSize: 10,
        maxRetries: 1,
        async loadBatch(ids) {
            calls += 1;
            queue.enqueue(ids);
            if (calls === 1) throw new Error('temporary');
            return {};
        },
        onError(ids) { failed.push(...ids); }
    });

    queue.enqueue(['a', 'b', 'a']);
    await queue.whenIdle();

    assert.equal(calls, 2);
    assert.deepEqual(failed, []);
});

test('icon load queue reports ids after retry budget is exhausted', async () => {
    const failed = [];
    const queue = createIconLoadQueue({
        maxRetries: 2,
        async loadBatch() { throw new Error('offline'); },
        onError(ids, error) { failed.push({ ids, message: error.message }); }
    });

    queue.enqueue(['a']);
    await queue.whenIdle();

    assert.deepEqual(failed, [{ ids: ['a'], message: 'offline' }]);
});
