const { Markup } = require('telegraf');
const db = require('../lib/db');
const { escMd } = require('../lib/utils');

const STORE_NAME = process.env.STORE_NAME || 'BangDet-MD';

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
        `> ${greet}\n> Selamat datang di *${escMd(STORE_NAME)}*\n> ─────────────────\n` +
        `> 👤 Total User: *${stats.totalUser.toLocaleString('id-ID')}*\n` +
        `> ✅ Transaksi : *${stats.totalTransaksi.toLocaleString('id-ID')}x*\n> ─────────────────\n\n` +
        `💰 Saldo: *Rp ${saldo.toLocaleString('id-ID')}*\n` +
        `_Pilih menu di bawah:_`;

    try { await ctx.replyWithChatAction('typing'); } catch (e) {}
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
