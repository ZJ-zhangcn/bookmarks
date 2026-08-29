/**
 * 路由模块索引
 */
module.exports = function(db, options = {}) {
    return {
        categories: require('./categories')(db),
        bookmarks: require('./bookmarks')(db, options.bookmarks),
        todos: require('./todos')(db),
        engines: require('./engines')(db),
        iconUnified: require('./icon-unified')(db),
        metadata: require('./metadata')(db),
        config: require('./config')(db),
        webdav: require('./webdav')(db),
        data: require('./data')(db),
        suggest: require('./suggest')(db)
    };
};
