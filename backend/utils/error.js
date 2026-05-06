/**
 * 错误处理中间件
 */

class AppError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

function errorHandler(err, req, res, _next) {
    const statusCode = err.statusCode || 500;
    const message = err.isOperational ? err.message : '服务器内部错误';

    if (process.env.NODE_ENV !== 'production') {
        console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}:`, err.message);
    }

    res.status(statusCode).json({
        success: false,
        error: message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
}

function notFoundHandler(req, res) {
    res.status(404).json({
        success: false,
        error: `路径 ${req.originalUrl} 不存在`
    });
}

module.exports = { AppError, asyncHandler, errorHandler, notFoundHandler };
