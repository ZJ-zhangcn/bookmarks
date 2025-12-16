/**
 * 路由模块索引
 */
module.exports = function(db) {
    return {
        categories: require('./categories')(db),
        bookmarks: require('./bookmarks')(db),
        engines: require('./engines')(db),
        icons: require('./icons')(db),
        icon: require('./icon')(db),
        favicon: require('./favicon')(db),
        config: require('./config')(db),
        webdav: require('./webdav')(db),
        docker: require('./docker')(db),
        system: require('./system')(db),
        data: require('./data')(db)
    };
};
