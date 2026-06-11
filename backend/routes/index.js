/**
 * 路由模块索引
 */
module.exports = function(db) {
    return {
        categories: require('./categories')(db),
        bookmarks: require('./bookmarks')(db),
        todos: require('./todos')(db),
        engines: require('./engines')(db),
        iconUnified: require('./icon-unified')(db),
        metadata: require('./metadata')(db),
        config: require('./config')(db),
        webdav: require('./webdav')(db),
        data: require('./data')(db),
        serviceStatus: require('./service-status')(db),
        suggest: require('./suggest')(db)
    };
};
