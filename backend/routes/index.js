/**
 * 路由模块索引
 */
module.exports = function(db) {
    return {
        categories: require('./categories')(db),
        bookmarks: require('./bookmarks')(db),
        todos: require('./todos')(db),
        engines: require('./engines')(db),
        icons: require('./icons')(db),
        icon: require('./icon')(db),
        favicon: require('./favicon')(db),
        metadata: require('./metadata')(db),
        config: require('./config')(db),
        webdav: require('./webdav')(db),
        system: require('./system')(db),
        data: require('./data')(db),
        suggest: require('./suggest')(db),
        hermes: require('./hermes')(db)
    };
};
