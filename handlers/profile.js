const { Markup } = require('telegraf');
const db = require('../lib/db');
const { formatDate, statusEmoji, methodName, escMd } = require('../lib/utils');
const { formatHarga } = require('./products');

const STORE_NAME = process.env.STORE_NAME || 'Diera Store';
const ORDER_PAGE_SIZE = 5;

// ── Helper edit/hapus+kirim ─────────────────────────────
async function editOrReply(ctx, text, keyboard) {
    try {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    } catch (e) {
        try { await ctx.deleteMessage(); } catch (_) { }
        await ctx.replyWithMarkdown(text, keyboard);
    }
}

// ── PROFIL ─────────────────────────────────────────────
async function showProfil(ctx) {
    const userId = ctx.from.id;
    const user = db.getUser(userId);
    if (!user) return ctx.answerCbQuery('❌ Belum terdaftar. Ketik /start', { show_alert: true });

    const text =
        `👤 *PROFIL SAYA*\n${'─'.repeat(28)}\n\n` +
        `🏷️ *Nama:* ${user.nama}\n` +
        `📱 *Username:* ${user.username ? '@' + user.username : '—'}\n` +
        `🆔 *User ID:* \`${userId}\`\n\n` +
        `${'─'.repeat(28)}\n` +
        `💰 *Saldo:* *Rp ${(user.saldo || 0).toLocaleString('id-ID')}*\n` +
        `🛒 *Total Order:* ${user.totalOrder || 0}x\n` +
        `📅 *Bergabung:* ${formatDate(user.bergabung)}`;

    await editOrReply(ctx, text, Markup.inlineKeyboard([
        [Markup.button.callback('💰  Top Up Saldo', 'menu_deposit')],
        [
            Markup.button.callback('📋  Riwayat Order', 'menu_riwayat'),
            Markup.button.callback('🏠  Menu Utama', 'menu_utama')
        ]
    ]));
    ctx.answerCbQuery?.();
}

// ── RIWAYAT ORDER (dengan paginasi) ───────────────────
async function showRiwayat(ctx, page = 0) {
    const userId = ctx.from.id;
    const allOrders = db.getOrdersByUser(userId, 9999);
    const totalPages = Math.max(1, Math.ceil(allOrders.length / ORDER_PAGE_SIZE));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const orders = allOrders.slice(safePage * ORDER_PAGE_SIZE, (safePage + 1) * ORDER_PAGE_SIZE);

    let text = `📋 *RIWAYAT ORDER*\n`;
    text += `Halaman ${safePage + 1} dari ${totalPages}\n`;
    text += `${'─'.repeat(28)}\n\n`;

    if (allOrders.length === 0) {
        text += `_Belum ada riwayat order._\n\nYuk beli produk pertamamu! 🛍️`;
    } else {
        orders.forEach(o => {
            const em = statusEmoji(o.status);
            text += `${em} *${o.productName}*\n`;
            text += `   💵 ${formatHarga(o.harga)} via ${methodName(o.paymentMethod)}\n`;
            text += `   🕐 ${formatDate(o.createdAt)}\n\n`;
        });
    }

    const navRow = [];
    if (safePage > 0) navRow.push(Markup.button.callback('◀️  Sebelumnya', `riwayat_page_${safePage - 1}`));
    if (safePage < totalPages - 1) navRow.push(Markup.button.callback('Selanjutnya  ▶️', `riwayat_page_${safePage + 1}`));

    const rows = [];
    if (navRow.length > 0) rows.push(navRow);
    rows.push([
        Markup.button.callback('👤  Profil', 'menu_profil'),
        Markup.button.callback('🏠  Menu Utama', 'menu_utama')
    ]);

    await editOrReply(ctx, text, Markup.inlineKeyboard(rows));
    ctx.answerCbQuery?.();
}

// ── INFO ───────────────────────────────────────────────
async function showInfo(ctx) {
    const text =
        `ℹ️ *INFORMASI ${escMd(STORE_NAME)}*\n${'─'.repeat(28)}\n\n` +
        `🏪 *Toko:* ${escMd(STORE_NAME)}\n` +
        `📦 *Produk:* Aplikasi & Software Premium\n` +
        `💳 *Pembayaran:* QRIS · Saldo · Transfer Bank\n` +
        `⚡ *Proses:* Otomatis / Max 5 menit\n` +
        `🔒 *Garansi:* Sesuai masa berlaku produk\n\n` +
        `_Terima kasih telah berbelanja di ${escMd(STORE_NAME)}!_ 💛`;

    await editOrReply(ctx, text, Markup.inlineKeyboard([
        [Markup.button.callback('✨  Cara Order', 'menu_cara_order')],
        [
            Markup.button.callback('🛍️  Lihat Produk', 'menu_produk'),
            Markup.button.callback('🏠  Menu Utama', 'menu_utama')
        ]
    ]));
    ctx.answerCbQuery?.();
}

// ── CARA ORDER ─────────────────────────────────────────
async function showCaraOrder(ctx) {
    const text =
        `✨ *CARA ORDER*\n${'─'.repeat(28)}\n\n` +
        `*1️⃣  Pilih Produk*\n` +
        `Buka menu 🛍️ Semua Produk, pilih nomor produk.\n\n` +
        `*2️⃣  Cek Detail*\n` +
        `Lihat harga, stok, deskripsi & S&K produk.\n\n` +
        `*3️⃣  Pilih Metode Bayar*\n` +
        `• 💳 *Saldo* — Potong saldo otomatis\n` +
        `• 📱 *QRIS* — Scan QR dengan e-wallet/m-banking\n\n` +
        `*4️⃣  Selesaikan Pembayaran*\n` +
        `Bayar sesuai nominal tepat.\n\n` +
        `*5️⃣  Terima Produk* 🎉\n` +
        `Detail akun dikirim otomatis ke chat ini.\n\n` +
        `💡 *Tips:* Top up saldo dulu biar order lebih cepat!`;

    await editOrReply(ctx, text, Markup.inlineKeyboard([
        [Markup.button.callback('🛍️  Lihat Produk', 'menu_produk')],
        [
            Markup.button.callback('💰  Deposit', 'menu_deposit'),
            Markup.button.callback('🏠  Menu Utama', 'menu_utama')
        ]
    ]));
    ctx.answerCbQuery?.();
}

module.exports = { showProfil, showRiwayat, showInfo, showCaraOrder };
