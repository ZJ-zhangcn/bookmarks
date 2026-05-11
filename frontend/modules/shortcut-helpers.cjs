function getShortcutHelpItems() {
    return [
        { key: 'Ctrl/⌘ + K', desc: '聚焦首页书签过滤' },
        { key: 'Ctrl/⌘ + N', desc: '添加新书签' },
        { key: 'Ctrl/⌘ + Shift + N', desc: '添加新分类' },
        { key: 'Ctrl/⌘ + ,', desc: '打开设置' },
        { key: 'Ctrl/⌘ + F', desc: '打开书签搜索弹窗' },
        { key: '/', desc: '快速聚焦过滤输入框' },
        { key: 'Esc', desc: '关闭当前弹窗' },
        { key: '?', desc: '打开快捷键帮助' }
    ];
}

module.exports = { getShortcutHelpItems };
