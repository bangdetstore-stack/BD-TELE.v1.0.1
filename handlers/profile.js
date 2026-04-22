const { Markup } = require('telegraf');
const db = require('../lib/db');
const { formatDate, statusEmoji, methodName, escMd } = require('../lib/utils');
const { formatHarga } = require('./products');

const STORE_NAME = process.env.STORE_NAME || 'BangDet-MD';
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
        `> 👤 *PROFIL SAYA*\n> ─────────────────\n` +
        `> Nama      : *${escMd(user.nama)}*\n` +
        `> Username  : ${user.username ? escMd('@' + user.username) : '—'}\n` +
        `> User ID   : \`${userId}\`\n> ─────────────────\n` +
        `> Saldo     : *Rp ${(user.saldo || 0).toLocaleString('id-ID')}*\n` +
        `> Order     : *${user.totalOrder || 0}x*\n` +
        `> Bergabung : ${formatDate(user.bergabung)}`;

    await editOrReply(ctx, text, Markup.inlineKeyboard([
        [Markup.button.callback('💰 Top Up Saldo', 'menu_deposit'), Markup.button.callback('📋 Riwayat', 'menu_riwayat')],
        [Markup.button.callback('🏠 Beranda', 'menu_utama')]
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

    let text = `> 📋 *RIWAYAT ORDER*\n> Halaman ${safePage + 1} dari ${totalPages}\n> ─────────────────\n\n`;

    if (allOrders.length === 0) {
        text += `_Belum ada riwayat order._\n\nYuk beli produk pertamamu\!`;
    } else {
        orders.forEach(o => {
            const em = statusEmoji(o.status);
            text += `${em} *${escMd(o.productName)}*\n`;
            text += `   ${formatHarga(o.harga)} via ${escMd(methodName(o.paymentMethod))}\n`;
            text += `   _${formatDate(o.createdAt)}_\n\n`;
        });
    }

    const navRow = [];
    if (safePage > 0) navRow.push(Markup.button.callback('◀️  Sebelumnya', `riwayat_page_${safePage - 1}`));
    if (safePage < totalPages - 1) navRow.push(Markup.button.callback('Selanjutnya  ▶️', `riwayat_page_${safePage + 1}`));

    const rows = [];
    if (navRow.length > 0) rows.push(navRow);
    rows.push([
        Markup.button.callback('👤 Profil', 'menu_profil'),
        Markup.button.callback('🏠 Beranda', 'menu_utama')
    ]);

    await editOrReply(ctx, text, Markup.inlineKeyboard(rows));
    ctx.answerCbQuery?.();
}

// ── INFO ───────────────────────────────────────────────
async function showInfo(ctx) {
    const text =
        `> ℹ️ *${escMd(STORE_NAME)}*\n> ─────────────────\n` +
        `> Produk  : Aplikasi \\& Software Premium\n` +
        `> Bayar   : QRIS · Saldo · Virtual Account\n` +
        `> Proses  : Otomatis / Maks 5 menit\n` +
        `> Garansi : Sesuai masa berlaku produk\n> ─────────────────\n\n` +
        `_Terima kasih sudah belanja di ${escMd(STORE_NAME)}\\!_`;

    const csUsername = process.env.CS_USERNAME ? process.env.CS_USERNAME.replace('@', '') : '';
    const btnCS = csUsername ? [Markup.button.url('📞 Hubungi Admin', `https://t.me/${csUsername}`)] : [];

    await editOrReply(ctx, text, Markup.inlineKeyboard([
        [Markup.button.callback('Cara Order', 'menu_cara_order'), Markup.button.callback('FAQ', 'menu_faq')],
        btnCS,
        [
            Markup.button.callback('🛍️ Produk', 'menu_produk'),
            Markup.button.callback('🏠 Beranda', 'menu_utama')
        ]
    ]));
    ctx.answerCbQuery?.();
}

// ── FAQ ────────────────────────────────────────────────
async function showFaq(ctx) {
    const text =
        `> ❓ *FAQ*\n> ─────────────────\n\n` +
        `*1. Cara membeli?*\n` +
        `Pilih produk, bayar via Saldo atau QRIS. Akun langsung dikirim otomatis.\n\n` +
        `*2. Stok tidak tersedia?*\n` +
        `Jika stok 0, tunggu restock atau hubungi Admin.\n\n` +
        `*3. Sudah bayar QRIS tapi belum masuk?*\n` +
        `Tunggu 5\-30 detik, atau tekan tombol “Cek Status”. Jika 5 menit belum juga, hubungi CS.\n\n` +
        `*4. Cara klaim garansi?*\n` +
        `Hubungi CS dengan menyertakan Order ID kamu.`;

    const csUsername = process.env.CS_USERNAME ? process.env.CS_USERNAME.replace('@', '') : '';
    const btnCS = csUsername ? [Markup.button.url('📞 CS', `https://t.me/${csUsername}`)] : [];

    await editOrReply(ctx, text, Markup.inlineKeyboard([
        btnCS,
        [
            Markup.button.callback('« Kembali', 'menu_info'),
            Markup.button.callback('🏠 Beranda', 'menu_utama')
        ]
    ]));
    ctx.answerCbQuery?.();
}

// ── CARA ORDER ─────────────────────────────────────────
async function showCaraOrder(ctx) {
    const text =
        `> ✨ *CARA ORDER*\n> ─────────────────\n\n` +
        `*1\. Pilih Produk*\n_Buka menu Semua Produk, pilih yang kamu mau._\n\n` +
        `*2\. Cek Detail*\n_Lihat harga, stok, deskripsi \& S\&K._\n\n` +
        `*3\. Pilih Metode Bayar*\n_Saldo \(langsung potong\) atau QRIS \(scan QR\)._\n\n` +
        `*4\. Bayar*\n_Bayar sesuai nominal yang tertera._\n\n` +
        `*5\. Terima Produk*\n_Detail akun dikirim otomatis ke sini\!_\n\n` +
        `💡 _Tips: Top up saldo dulu biar proses lebih cepat\._`;

    await editOrReply(ctx, text, Markup.inlineKeyboard([
        [Markup.button.callback('🛍️ Produk', 'menu_produk'), Markup.button.callback('💰 Deposit', 'menu_deposit')],
        [Markup.button.callback('🏠 Beranda', 'menu_utama')]
    ]));
    ctx.answerCbQuery?.();
}

module.exports = { showProfil, showRiwayat, showInfo, showCaraOrder, showFaq };
