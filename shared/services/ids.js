const crypto = require('crypto');

function newId(prefix) {
    return `${prefix}_${crypto.randomUUID()}`;
}

module.exports = { newId };
