const { Markup } = require('telegraf');
const db = require('../lib/db');

const STORE_NAME = process.env.STORE_NAME || 'Diera Store';
const MEDALS = ['🥇', '🥈', '🥉'];

function escapeHTML(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function showLeaderboard(ctx) {
    const top = db.getLeaderboard(10);

    let text = `🏆 <b>LEADERBOARD ${escapeHTML(STORE_NAME)}</b>\n${'━'.repeat(30)}\n\n`;

    if (top.length === 0) {
        text += '<i>Belum ada transaksi. Jadilah yang pertama! 🚀</i>';
    } else {
        top.forEach((u, i) => {
            const medal = MEDALS[i] || `${i + 1}.`;
            const displayName = u.username ? `@${u.username}` : u.nama;
            const masking = maskName(displayName);
            text += `${medal} <b>${escapeHTML(masking)}</b>\n`;
            text += `   🛒 ${u.totalOrder || 0}x order\n\n`;
        });
        text += `<i>Data diperbarui setiap transaksi.</i>`;
    }

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🛍️ Semua Produk', 'menu_produk')],
        [Markup.button.callback('🏠 Menu Utama', 'menu_utama')]
    ]);

    try {
        await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
    } catch (e) {
        try { await ctx.deleteMessage(); } catch (_) { }
        await ctx.replyWithHTML(text, keyboard);
    }
    ctx.answerCbQuery().catch(() => { });
}

// Samarkan sebagian nama untuk privasi: "Diera Store" → "D•••e"
function maskName(name) {
    if (!name) return 'Anonymous';
    if (name.startsWith('@')) {
        const u = name.slice(1);
        if (u.length <= 3) return '@' + u[0] + '•••';
        return '@' + u[0] + '•'.repeat(u.length - 2) + u[u.length - 1];
    }
    const words = name.trim().split(' ');
    const first = words[0];
    if (first.length <= 2) return first + '•••';
    return first[0] + '•'.repeat(first.length - 2) + first[first.length - 1];
}

module.exports = { showLeaderboard };
