const { Markup } = require('telegraf');
const db = require('../lib/db');

const STORE_NAME = process.env.STORE_NAME || 'Diera Store';

async function handleStart(ctx) {
    const userId = ctx.from.id;
    const nama = `${ctx.from.first_name || ''}${ctx.from.last_name ? ' ' + ctx.from.last_name : ''}`.trim();
    const username = ctx.from.username || '';

    let user = db.getUser(userId);
    const isNew = !user;
    if (isNew) user = db.registerUser(userId, { nama, username });

    const stats = db.getStats();
    const saldo = user.saldo || 0;

    const greet = isNew
        ? `Halo, *${nama}* 👋\nAkun kamu sudah terdaftar otomatis!`
        : `Hai, *${nama}* 👋`;

    const text =
        `${greet}\n\n` +
        `Selamat datang di *${STORE_NAME}*\n` +
        `${'─'.repeat(28)}\n` +
        `👤 Total User Bot: *${stats.totalUser.toLocaleString('id-ID')} Orang*\n` +
        `✅ Total Transaksi: *${stats.totalTransaksi.toLocaleString('id-ID')}x*\n\n` +
        `💰 Saldo kamu: *Rp ${saldo.toLocaleString('id-ID')}*\n\n` +
        `Tekan tombol di bawah untuk mulai 🔥`;

    await ctx.replyWithMarkdown(text, mainMenuKeyboard());
}

function mainMenuKeyboard() {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('🛍️  Semua Produk', 'menu_produk'),
            Markup.button.callback('📦  Stok Tersedia', 'menu_stok_ready')
        ],
        [
            Markup.button.callback('💰  Deposit Saldo', 'menu_deposit'),
            Markup.button.callback('👤  Profil Saya', 'menu_profil')
        ],
        [
            Markup.button.callback('📋  Riwayat Order', 'menu_riwayat'),
            Markup.button.callback('🏆  Leaderboard', 'menu_leaderboard')
        ],
        [
            Markup.button.callback('ℹ️   Info & Cara Order', 'menu_info')
        ]
    ]);
}

module.exports = { handleStart, mainMenuKeyboard };
