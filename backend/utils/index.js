/**
 * 工具函数统一导出
 */

const { success, error, paginated } = require('./response');
const { AppError, asyncHandler, errorHandler, notFoundHandler } = require('./error');
const { requestLogger } = require('./logger');
const { clampInt, toInt01, toMysqlDatetimeString, normalizeDatetime, nowDatetime } = require('./params');

module.exports = {
    success,
    error,
    paginated,
    AppError,
    asyncHandler,
    errorHandler,
    notFoundHandler,
    requestLogger,
    clampInt,
    toInt01,
    toMysqlDatetimeString,
    normalizeDatetime,
    nowDatetime
};
