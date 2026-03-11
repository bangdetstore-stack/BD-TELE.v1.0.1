const { Markup } = require('telegraf');
const db = require('../lib/db');
const { escMd } = require('../lib/utils');

const STORE_NAME = process.env.STORE_NAME || 'Diera Store';
const MEDALS = ['🥇', '🥈', '🥉'];

async function showLeaderboard(ctx) {
    const top = db.getLeaderboard(10);

    let text = `🏆 *LEADERBOARD ${escMd(STORE_NAME)}*\n${'━'.repeat(30)}\n\n`;

    if (top.length === 0) {
        text += '_Belum ada transaksi. Jadilah yang pertama! 🚀_';
    } else {
        top.forEach((u, i) => {
            const medal = MEDALS[i] || `${i + 1}.`;
            const displayName = u.username ? `@${u.username}` : u.nama;
            const masking = maskName(displayName);
            text += `${medal} *${escMd(masking)}*\n`;
            text += `   🛒 ${u.totalOrder || 0}x order\n\n`;
        });
        text += `_Data diperbarui setiap transaksi._`;
    }

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🛍️ Semua Produk', 'menu_produk')],
        [Markup.button.callback('🏠 Menu Utama', 'menu_utama')]
    ]);

    try {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    } catch (e) {
        try { await ctx.deleteMessage(); } catch (_) { }
        await ctx.replyWithMarkdown(text, keyboard);
    }
    ctx.answerCbQuery();
}

// Samarkan sebagian nama untuk privasi: "Diera Store" → "D***e"
function maskName(name) {
    if (!name) return 'Anonymous';
    if (name.startsWith('@')) {
        const u = name.slice(1);
        if (u.length <= 3) return '@' + u[0] + '***';
        return '@' + u[0] + '*'.repeat(u.length - 2) + u[u.length - 1];
    }
    const words = name.trim().split(' ');
    const first = words[0];
    if (first.length <= 2) return first + '***';
    return first[0] + '*'.repeat(first.length - 1);
}

module.exports = { showLeaderboard };
