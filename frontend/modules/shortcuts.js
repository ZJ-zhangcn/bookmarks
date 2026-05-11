import shortcutHelpers from './shortcut-helpers.cjs';
import { showConfirm } from './ux.js';

const { getShortcutHelpItems } = shortcutHelpers;

export function openShortcutHelp() {
    const message = getShortcutHelpItems()
        .map(item => `${item.key}：${item.desc}`)
        .join('\n');
    return showConfirm({
        title: '快捷键帮助',
        message,
        confirmText: '知道了',
        cancelText: '',
        hideCancel: true
    });
}

export { getShortcutHelpItems };
