function moveItemInList(items, index, direction) {
    const list = Array.isArray(items) ? [...items] : [];
    const from = Number(index);
    const step = Number(direction);
    if (!Number.isInteger(from) || !Number.isInteger(step) || step === 0) return list;
    const to = from + step;
    if (from < 0 || from >= list.length || to < 0 || to >= list.length) return list;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    return list;
}

module.exports = { moveItemInList };
