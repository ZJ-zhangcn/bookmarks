const { AppError } = require('../../utils');
const { assertPublicFetchUrl } = require('../../middleware/security');
const iconsService = require('../../../shared/services/icons');

function createIconLibraryService(db, deps = {}) {
    const assertSafeFetchUrl = deps.assertPublicFetchUrl || assertPublicFetchUrl;

    async function list() {
        return iconsService.getAllIcons(db);
    }

    async function upload({ name, data, type } = {}) {
        if (!data) {
            throw new AppError('缺少图标数据', 400);
        }
        return iconsService.uploadIcon(db, { name, data, type });
    }

    async function uploadFromUrl({ url, name } = {}) {
        if (!url) {
            throw new AppError('缺少 URL', 400);
        }
        return iconsService.uploadIconFromUrl(db, { url, name }, assertSafeFetchUrl);
    }

    async function deleteById(id) {
        if (!id) {
            throw new AppError('缺少图标 ID', 400);
        }
        return iconsService.deleteIcon(db, id);
    }

    async function batchDelete(ids) {
        if (!Array.isArray(ids) || ids.length === 0) return;
        return iconsService.batchDeleteIcons(db, ids);
    }

    async function clearFromBookmarks(iconData) {
        if (!iconData) {
            throw new AppError('缺少图标数据', 400);
        }
        return iconsService.clearIconFromBookmarks(db, iconData);
    }

    async function batchClearFromBookmarks(iconDataList) {
        if (!Array.isArray(iconDataList) || iconDataList.length === 0) return;
        return iconsService.batchClearIconsFromBookmarks(db, iconDataList);
    }

    return {
        list,
        upload,
        uploadFromUrl,
        deleteById,
        batchDelete,
        clearFromBookmarks,
        batchClearFromBookmarks
    };
}

module.exports = { createIconLibraryService };
