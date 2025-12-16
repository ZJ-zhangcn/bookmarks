/**
 * 请求日志中间件
 */

function requestLogger(req, res, next) {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        const status = res.statusCode;
        const color = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';
        const reset = '\x1b[0m';

        if (process.env.LOG_REQUESTS === 'true' || status >= 400) {
            console.log(`${color}${status}${reset} ${req.method} ${req.path} ${duration}ms`);
        }
    });

    next();
}

module.exports = { requestLogger };
