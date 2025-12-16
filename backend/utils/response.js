/**
 * 统一响应工具函数
 */

function success(data = null, message = 'ok') {
    return { success: true, data, message };
}

function error(message = 'error', code = 400) {
    return { success: false, error: message, code };
}

function paginated(data, page, pageSize, total) {
    return {
        success: true,
        data,
        pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize)
        }
    };
}

module.exports = { success, error, paginated };
