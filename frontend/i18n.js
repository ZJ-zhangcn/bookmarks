/**
 * 国际化 (i18n) 支持
 * 支持语言：简体中文 (zh-CN)、繁体中文 (zh-TW)、English (en)
 */

const translations = {
    'zh-CN': {
        // 通用
        save: '保存',
        cancel: '取消',
        delete: '删除',
        edit: '编辑',
        add: '添加',
        confirm: '确认',
        close: '关闭',
        loading: '加载中...',
        success: '成功',
        error: '错误',

        // 头部
        siteTitle: '书签导航',
        tagline: '快速访问您的常用网站',
        searchPlaceholder: '输入关键词搜索网页...',
        filterPlaceholder: '过滤书签...',

        // 分类
        all: '全部',
        categoryCount: '{count} 个',

        // 书签
        bookmarkName: '名称',
        bookmarkUrl: '网址',
        bookmarkDesc: '描述',
        bookmarkIcon: '图标',
        bookmarkCategory: '分类',
        addBookmark: '+ 添加书签',
        editBookmark: '编辑书签',
        deleteBookmarkConfirm: '确定删除这个书签吗？',
        autoFetch: '自动获取',
        noBookmarksFound: '没有找到匹配的书签',
        tryOtherKeywords: '试试其他关键词，或者添加一个新书签',
        addCategory: '+ 添加分类',

        // 搜索引擎
        searchEngine: '搜索引擎',
        manageEngines: '管理搜索引擎',
        addEngine: '添加搜索引擎',
        editEngine: '编辑搜索引擎',
        engineName: '名称',
        engineUrl: '搜索 URL',
        engineUrlHint: 'URL 末尾应包含查询参数，如 ?q= 或 ?wd=',

        // 设置
        settings: '设置',
        settingsGeneral: '常规设置',
        settingsPersonalization: '个性化',
        settingsCategories: '分类管理',
        settingsDocker: 'Docker',
        settingsSync: '数据同步',
        settingsAbout: '关于',

        // 语言
        language: '语言',
        languageZhCN: '简体中文',
        languageZhTW: '繁體中文',
        languageEn: 'English',

        // 个性化
        logo: 'LOGO',
        logoShow: '显示',
        logoText: '文本内容',
        clock: '时钟组件',
        clockShow: '显示',
        clockShowSeconds: '显示秒',
        searchBar: '搜索栏组件',
        searchBarShow: '显示',
        searchBarBgColor: '背景颜色',
        searchBarTextColor: '文字颜色',
        searchBarBorderColor: '边框颜色',
        wallpaper: '壁纸',
        wallpaperUrl: '图片 URL',
        wallpaperBlur: '模糊',
        wallpaperDim: '遮罩',
        contentArea: '内容区域',
        contentMaxWidth: '最大宽度',
        contentPadding: '内边距',

        // 分类管理
        categoryName: '分类名称',
        categoryIcon: '分类图标',
        addCategory: '添加分类',
        editCategory: '编辑分类',
        deleteCategoryConfirm: '删除分类将同时删除该分类下的所有书签，确定删除吗？',

        // Docker
        dockerTitle: 'Docker 容器管理',
        dockerDesc: '在这里您可以查看 Docker 容器状态，控制容器启停',
        dockerContainerName: '容器名称',
        dockerImage: '镜像',
        dockerStatus: '状态',
        dockerActions: '操作',
        dockerStart: '启动',
        dockerStop: '停止',
        dockerRestart: '重启',
        dockerRemove: '删除',
        dockerRunning: '运行中',
        dockerStopped: '已停止',
        dockerError: '错误',
        dockerNotAvailable: '无法连接 Docker，请确保已挂载 docker.sock',

        // 数据同步
        webdavTitle: 'WebDAV 云同步',
        webdavServer: '服务器地址',
        webdavUsername: '用户名',
        webdavPassword: '密码',
        webdavPath: '文件路径',
        webdavSaveSettings: '保存设置',
        webdavUpload: '上传',
        webdavDownload: '下载',
        localExport: '本地导出',
        localImport: '本地导入',
        exportData: '导出数据',
        importData: '导入数据',

        // 关于
        aboutTitle: '关于',
        aboutVersion: '版本',
        aboutDesc: '一个简洁美观的书签导航页面',

        // 页脚
        footer: '© 2024 书签导航 · 快捷访问常用网站'
    },

    'zh-TW': {
        // 通用
        save: '儲存',
        cancel: '取消',
        delete: '刪除',
        edit: '編輯',
        add: '新增',
        confirm: '確認',
        close: '關閉',
        loading: '載入中...',
        success: '成功',
        error: '錯誤',

        // 頭部
        siteTitle: '書籤導航',
        tagline: '快速訪問您的常用網站',
        searchPlaceholder: '輸入關鍵詞搜索網頁...',
        filterPlaceholder: '過濾書籤...',

        // 分類
        all: '全部',
        categoryCount: '{count} 個',

        // 書籤
        bookmarkName: '名稱',
        bookmarkUrl: '網址',
        bookmarkDesc: '描述',
        bookmarkIcon: '圖標',
        bookmarkCategory: '分類',
        addBookmark: '+ 新增書籤',
        editBookmark: '編輯書籤',
        deleteBookmarkConfirm: '確定刪除這個書籤嗎？',
        autoFetch: '自動獲取',
        noBookmarksFound: '沒有找到匹配的書籤',
        tryOtherKeywords: '試試其他關鍵詞，或者新增一個書籤',
        addCategory: '+ 新增分類',

        // 搜索引擎
        searchEngine: '搜索引擎',
        manageEngines: '管理搜索引擎',
        addEngine: '新增搜索引擎',
        editEngine: '編輯搜索引擎',
        engineName: '名稱',
        engineUrl: '搜索 URL',
        engineUrlHint: 'URL 末尾應包含查詢參數，如 ?q= 或 ?wd=',

        // 設置
        settings: '設置',
        settingsGeneral: '常規設置',
        settingsPersonalization: '個性化',
        settingsCategories: '分類管理',
        settingsDocker: 'Docker',
        settingsSync: '數據同步',
        settingsAbout: '關於',

        // 語言
        language: '語言',
        languageZhCN: '简体中文',
        languageZhTW: '繁體中文',
        languageEn: 'English',

        // 個性化
        logo: 'LOGO',
        logoShow: '顯示',
        logoText: '文本內容',
        clock: '時鐘組件',
        clockShow: '顯示',
        clockShowSeconds: '顯示秒',
        searchBar: '搜索欄組件',
        searchBarShow: '顯示',
        searchBarBgColor: '背景顏色',
        searchBarTextColor: '文字顏色',
        searchBarBorderColor: '邊框顏色',
        wallpaper: '壁紙',
        wallpaperUrl: '圖片 URL',
        wallpaperBlur: '模糊',
        wallpaperDim: '遮罩',
        contentArea: '內容區域',
        contentMaxWidth: '最大寬度',
        contentPadding: '內邊距',

        // 分類管理
        categoryName: '分類名稱',
        categoryIcon: '分類圖標',
        addCategory: '新增分類',
        editCategory: '編輯分類',
        deleteCategoryConfirm: '刪除分類將同時刪除該分類下的所有書籤，確定刪除嗎？',

        // Docker
        dockerTitle: 'Docker 容器管理',
        dockerDesc: '在這裡您可以查看 Docker 容器狀態，控制容器啟停',
        dockerContainerName: '容器名稱',
        dockerImage: '鏡像',
        dockerStatus: '狀態',
        dockerActions: '操作',
        dockerStart: '啟動',
        dockerStop: '停止',
        dockerRestart: '重啟',
        dockerRemove: '刪除',
        dockerRunning: '運行中',
        dockerStopped: '已停止',
        dockerError: '錯誤',
        dockerNotAvailable: '無法連接 Docker，請確保已掛載 docker.sock',

        // 數據同步
        webdavTitle: 'WebDAV 雲同步',
        webdavServer: '服務器地址',
        webdavUsername: '用戶名',
        webdavPassword: '密碼',
        webdavPath: '文件路徑',
        webdavSaveSettings: '保存設置',
        webdavUpload: '上傳',
        webdavDownload: '下載',
        localExport: '本地導出',
        localImport: '本地導入',
        exportData: '導出數據',
        importData: '導入數據',

        // 關於
        aboutTitle: '關於',
        aboutVersion: '版本',
        aboutDesc: '一個簡潔美觀的書籤導航頁面',

        // 頁腳
        footer: '© 2024 書籤導航 · 快捷訪問常用網站'
    },

    'en': {
        // Common
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Delete',
        edit: 'Edit',
        add: 'Add',
        confirm: 'Confirm',
        close: 'Close',
        loading: 'Loading...',
        success: 'Success',
        error: 'Error',

        // Header
        siteTitle: 'Bookmark Nav',
        tagline: 'Quick access to your favorite websites',
        searchPlaceholder: 'Search the web...',
        filterPlaceholder: 'Filter bookmarks...',

        // Categories
        all: 'All',
        categoryCount: '{count} items',

        // Bookmarks
        bookmarkName: 'Name',
        bookmarkUrl: 'URL',
        bookmarkDesc: 'Description',
        bookmarkIcon: 'Icon',
        bookmarkCategory: 'Category',
        addBookmark: '+ Add Bookmark',
        editBookmark: 'Edit Bookmark',
        deleteBookmarkConfirm: 'Are you sure to delete this bookmark?',
        autoFetch: 'Auto Fetch',
        noBookmarksFound: 'No bookmarks found',
        tryOtherKeywords: 'Try other keywords, or add a new bookmark',
        addCategory: '+ Add Category',

        // Search Engine
        searchEngine: 'Search Engine',
        manageEngines: 'Manage Engines',
        addEngine: 'Add Search Engine',
        editEngine: 'Edit Search Engine',
        engineName: 'Name',
        engineUrl: 'Search URL',
        engineUrlHint: 'URL should end with query parameter like ?q= or ?wd=',

        // Settings
        settings: 'Settings',
        settingsGeneral: 'General',
        settingsPersonalization: 'Personalization',
        settingsCategories: 'Categories',
        settingsDocker: 'Docker',
        settingsSync: 'Data Sync',
        settingsAbout: 'About',

        // Language
        language: 'Language',
        languageZhCN: '简体中文',
        languageZhTW: '繁體中文',
        languageEn: 'English',

        // Personalization
        logo: 'LOGO',
        logoShow: 'Show',
        logoText: 'Text Content',
        clock: 'Clock Widget',
        clockShow: 'Show',
        clockShowSeconds: 'Show Seconds',
        searchBar: 'Search Bar',
        searchBarShow: 'Show',
        searchBarBgColor: 'Background Color',
        searchBarTextColor: 'Text Color',
        searchBarBorderColor: 'Border Color',
        wallpaper: 'Wallpaper',
        wallpaperUrl: 'Image URL',
        wallpaperBlur: 'Blur',
        wallpaperDim: 'Dim',
        contentArea: 'Content Area',
        contentMaxWidth: 'Max Width',
        contentPadding: 'Padding',

        // Category Management
        categoryName: 'Category Name',
        categoryIcon: 'Category Icon',
        addCategory: 'Add Category',
        editCategory: 'Edit Category',
        deleteCategoryConfirm: 'Deleting category will also delete all bookmarks in it. Are you sure?',

        // Docker
        dockerTitle: 'Docker Container Management',
        dockerDesc: 'View and control Docker containers here',
        dockerContainerName: 'Container Name',
        dockerImage: 'Image',
        dockerStatus: 'Status',
        dockerActions: 'Actions',
        dockerStart: 'Start',
        dockerStop: 'Stop',
        dockerRestart: 'Restart',
        dockerRemove: 'Remove',
        dockerRunning: 'Running',
        dockerStopped: 'Stopped',
        dockerError: 'Error',
        dockerNotAvailable: 'Cannot connect to Docker. Please ensure docker.sock is mounted.',

        // Data Sync
        webdavTitle: 'WebDAV Cloud Sync',
        webdavServer: 'Server URL',
        webdavUsername: 'Username',
        webdavPassword: 'Password',
        webdavPath: 'File Path',
        webdavSaveSettings: 'Save Settings',
        webdavUpload: 'Upload',
        webdavDownload: 'Download',
        localExport: 'Local Export',
        localImport: 'Local Import',
        exportData: 'Export Data',
        importData: 'Import Data',

        // About
        aboutTitle: 'About',
        aboutVersion: 'Version',
        aboutDesc: 'A clean and beautiful bookmark navigation page',

        // Footer
        footer: '© 2024 Bookmark Nav · Quick access to your websites'
    }
};

// 当前语言
let currentLang = localStorage.getItem('language') || 'zh-CN';

/**
 * 获取翻译文本
 * @param {string} key - 翻译键
 * @param {object} params - 替换参数，如 {count: 5}
 * @returns {string} 翻译后的文本
 */
function t(key, params = {}) {
    let text = translations[currentLang]?.[key] || translations['zh-CN'][key] || key;

    // 替换参数
    Object.keys(params).forEach(param => {
        text = text.replace(`{${param}}`, params[param]);
    });

    return text;
}

/**
 * 设置当前语言
 * @param {string} lang - 语言代码
 */
function setLanguage(lang) {
    if (translations[lang]) {
        currentLang = lang;
        localStorage.setItem('language', lang);
        return true;
    }
    return false;
}

/**
 * 获取当前语言
 * @returns {string} 语言代码
 */
function getLanguage() {
    return currentLang;
}

/**
 * 获取支持的语言列表
 * @returns {Array} 语言列表
 */
function getSupportedLanguages() {
    return [
        { code: 'zh-CN', name: '简体中文' },
        { code: 'zh-TW', name: '繁體中文' },
        { code: 'en', name: 'English' }
    ];
}

/**
 * 应用翻译到页面
 * 查找所有 data-i18n 属性的元素并替换其文本
 */
function applyTranslations() {
    // 更新所有带 data-i18n 属性的元素
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            el.textContent = t(key);
        }
    });

    // 更新所有带 data-i18n-placeholder 属性的元素
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) {
            el.placeholder = t(key);
        }
    });

    // 更新页面标题
    document.title = t('siteTitle');
}

// 导出
window.i18n = { t, setLanguage, getLanguage, getSupportedLanguages, applyTranslations };
