const { Markup } = require('telegraf');
const db = require('../lib/db');
const pakasir = require('../lib/pakasir');
const { generateQRBuffer } = require('../lib/qris');
const { generateOrderId, formatDate, escMd } = require('../lib/utils');
const { getProducts, saveProducts, formatHarga } = require('./products');

const ADMIN_ID = parseInt(process.env.ADMIN_ID);

// ── BELI DENGAN SALDO ──────────────────────────────────
async function beliDenganSaldo(ctx, productId) {
    const userId = ctx.from.id;
    const products = getProducts();
    const p = products.find(x => x.id === parseInt(productId));

    if (!p) return ctx.answerCbQuery('❌ Produk tidak ditemukan', { show_alert: true });

    const stok = db.getStock(p.id);
    if (stok <= 0) return ctx.answerCbQuery('❌ Stok habis!', { show_alert: true });

    const user = db.getUser(userId);
    if (!user) return ctx.answerCbQuery('❌ Ketik /start dulu', { show_alert: true });

    if (user.saldo < p.harga) {
        const kurang = p.harga - user.saldo;
        await ctx.answerCbQuery('❌ Saldo tidak cukup!', { show_alert: true });
        try {
            await ctx.editMessageText(
                `❌ *Saldo Tidak Cukup*\n\n💵 Harga: ${formatHarga(p.harga)}\n💰 Saldo kamu: ${formatHarga(user.saldo)}\n📉 Kurang: ${formatHarga(kurang)}`,
                {
                    parse_mode: 'Markdown', ...Markup.inlineKeyboard([
                        [Markup.button.callback('💰 Deposit Sekarang', 'menu_deposit')],
                        [Markup.button.callback('◀️ Kembali', `produk_${p.id}`)]
                    ])
                }
            );
        } catch (e) {
            try { await ctx.deleteMessage(); } catch (_) { }
            await ctx.replyWithMarkdown(
                `❌ *Saldo Tidak Cukup*\n\n💵 Harga: ${formatHarga(p.harga)}\n💰 Saldo: ${formatHarga(user.saldo)}\n📉 Kurang: ${formatHarga(kurang)}`,
                Markup.inlineKeyboard([[Markup.button.callback('💰 Deposit', 'menu_deposit')]])
            );
        }
        return;
    }

    ctx.answerCbQuery('⏳ Memproses...');

    const orderId = generateOrderId('ORD');

    // Ambil akun dari database
    const akunDetail = db.takeAccount(p.id, orderId);
    const newSaldo = db.kurangiSaldo(userId, p.harga);

    db.createOrder({
        orderId, userId, productId: p.id, productName: p.nama,
        harga: p.harga, paymentMethod: 'saldo', status: 'completed',
        detail: akunDetail
    });
    db.updateUser(userId, {
        totalOrder: (user.totalOrder || 0) + 1,
        totalSpend: (user.totalSpend || 0) + p.harga
    });

    let successText =
        `✅ *ORDER BERHASIL!*\n\n` +
        `🆔 Order ID: \`${orderId}\`\n` +
        `🏷️ Produk: *${p.nama}*\n` +
        `💵 Harga: ${formatHarga(p.harga)}\n` +
        `💰 Saldo tersisa: ${formatHarga(newSaldo)}\n`;

    if (akunDetail) {
        successText += `\n📦 *Detail Akun:*\n\`\`\`\n${akunDetail}\n\`\`\`\n\n`;
        if (p.cara_penggunaan && p.cara_penggunaan !== '-') {
            successText += `📌 *Cara Penggunaan:*\n${p.cara_penggunaan}\n\n`;
        }
        if (p.snk && p.snk !== '-') {
            successText += `📋 *S&K:*\n${p.snk}\n\n`;
        }
        successText += `_Jangan bagikan ke orang lain!_`;
    } else {
        successText += `\n📦 Admin akan segera mengirimkan detail akun.`;
    }

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🛍️ Beli Lagi', 'menu_produk')],
        [Markup.button.callback('📋 Riwayat Order', 'menu_riwayat')],
        [Markup.button.callback('🏠 Menu Utama', 'menu_utama')]
    ]);

    try {
        await ctx.editMessageText(successText, { parse_mode: 'Markdown', ...keyboard });
    } catch (e) {
        try { await ctx.deleteMessage(); } catch (_) { }
        await ctx.replyWithMarkdown(successText, keyboard);
    }

    // Notif admin
    if (ADMIN_ID) {
        try {
            await ctx.telegram.sendMessage(ADMIN_ID,
                `🛒 *ORDER BARU*\n\n👤 ${ctx.from.first_name} (${userId})\n🏷️ ${p.nama}\n💵 ${formatHarga(p.harga)}\n💳 Saldo\n🆔 \`${orderId}\``,
                { parse_mode: 'Markdown' }
            );
        } catch (e) { /* ignore */ }
    }
}

// ── BELI VIA QRIS ──────────────────────────────────────
async function beliViaQRIS(ctx, productId) {
    const userId = ctx.from.id;
    const products = getProducts();
    const p = products.find(x => x.id === parseInt(productId));

    if (!p) return ctx.answerCbQuery('❌ Produk tidak ditemukan', { show_alert: true });

    const stok = db.getStock(p.id);
    if (stok <= 0) return ctx.answerCbQuery('❌ Stok habis!', { show_alert: true });

    await ctx.answerCbQuery('⏳ Membuat QRIS...');

    const orderId = generateOrderId('PAY');
    const result = await pakasir.createTransaction(orderId, p.harga, 'qris');

    if (!result.success) {
        try {
            await ctx.editMessageText(`❌ *Gagal membuat pembayaran:*\n${escMd(result.error)}`,
                { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('◀️ Kembali', `produk_${p.id}`)]]) }
            );
        } catch (e) { await ctx.replyWithMarkdown(`❌ Gagal: ${result.error}`); }
        return;
    }

    const data = result.data;

    db.savePending(`pay_${orderId}`, {
        type: 'order', orderId, userId, productId: p.id,
        amount: data.total_payment, originalAmount: p.harga, expiredAt: data.expired_at
    });

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Cek Status Bayar', `cek_pay_${orderId}_${data.total_payment}`)],
        [Markup.button.callback('❌ Batalkan', `batal_pay_${orderId}_${data.total_payment}`)],
        [Markup.button.callback('🏠 Menu Utama', 'menu_utama')]
    ]);

    const caption =
        `📱 *SCAN QRIS UNTUK BAYAR*\n\n` +
        `🏷️ Produk: *${p.nama}*\n` +
        `💵 Total Bayar: *${formatHarga(data.total_payment)}*\n` +
        `⏰ Expired: ${formatDate(data.expired_at)}\n\n` +
        `Scan dengan m-banking / GoPay / OVO / Dana.\n` +
        `_Konfirmasi otomatis setelah pembayaran._`;

    try { await ctx.deleteMessage(); } catch (_) { }

    let qrBuffer;
    try { qrBuffer = await generateQRBuffer(data.payment_number); } catch (e) { qrBuffer = null; }

    if (qrBuffer) {
        await ctx.replyWithPhoto({ source: qrBuffer, filename: 'qris.png' },
            { caption, parse_mode: 'Markdown', ...keyboard }
        );
    } else {
        await ctx.replyWithMarkdown(`${caption}\n\n\`${data.payment_number}\``, keyboard);
    }
}

// ── CEK STATUS PEMBAYARAN ──────────────────────────────
async function cekStatusPayment(ctx, orderId, amount) {
    const result = await pakasir.checkTransaction(orderId, parseInt(amount));
    if (!result.success) return ctx.answerCbQuery('❌ Gagal cek status', { show_alert: true });

    if (result.data?.status === 'completed') {
        await prosesOrderSetelahBayar(ctx, orderId);
    } else {
        ctx.answerCbQuery('⏳ Belum dibayar. Selesaikan pembayaran dulu.', { show_alert: true });
    }
}

// ── PROSES ORDER SETELAH BAYAR ─────────────────────────
async function prosesOrderSetelahBayar(ctx, orderId) {
    const pending = db.getPending(`pay_${orderId}`);
    if (!pending) return;

    const userId = pending.userId;
    const products = getProducts();
    const p = products.find(x => x.id === parseInt(pending.productId));
    if (!p) return;

    // Ambil akun dari database
    const akunDetail = db.takeAccount(p.id, orderId);
    const user = db.getUser(userId);

    db.createOrder({
        orderId, userId, productId: p.id, productName: p.nama,
        harga: pending.originalAmount, paymentMethod: 'qris', status: 'completed',
        detail: akunDetail
    });
    db.updateUser(userId, {
        totalOrder: (user?.totalOrder || 0) + 1,
        totalSpend: (user?.totalSpend || 0) + pending.originalAmount
    });
    db.deletePending(`pay_${orderId}`);

    let successText =
        `✅ *PEMBAYARAN BERHASIL!*\n\n` +
        `🆔 Order ID: \`${orderId}\`\n` +
        `🏷️ Produk: *${p.nama}*\n` +
        `💵 Harga: ${formatHarga(pending.originalAmount)}\n`;

    if (akunDetail) {
        successText += `\n📦 *Detail Akun:*\n\`\`\`\n${akunDetail}\n\`\`\`\n\n`;
        if (p.cara_penggunaan && p.cara_penggunaan !== '-') {
            successText += `📌 *Cara Penggunaan:*\n${p.cara_penggunaan}\n\n`;
        }
        if (p.snk && p.snk !== '-') {
            successText += `📋 *S&K:*\n${p.snk}\n\n`;
        }
        successText += `_Jangan bagikan ke orang lain!_`;
    } else {
        successText += `\n📦 Admin akan mengirimkan detail akun segera.`;
    }

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🛍️ Beli Lagi', 'menu_produk')],
        [Markup.button.callback('📋 Riwayat', 'menu_riwayat')],
        [Markup.button.callback('🏠 Menu Utama', 'menu_utama')]
    ]);

    // Hapus pesan QR lama jika kita punya akses ke ctx yang utuh (saat hapus payload)
    if (ctx.callbackQuery) {
        try { await ctx.deleteMessage(); } catch (e) { }
    }

    try {
        await ctx.telegram.sendMessage(userId, successText, { parse_mode: 'Markdown', ...keyboard });
    } catch (e) {
        console.error('Gagal mengirim pesan sukses:', e);
    }

    if (ADMIN_ID) {
        try {
            await ctx.telegram.sendMessage(ADMIN_ID,
                `💰 *QRIS BAYAR SUKSES*\n\n👤 ${userId}\n🏷️ ${p.nama}\n💵 ${formatHarga(pending.originalAmount)}\n🆔 \`${orderId}\``,
                { parse_mode: 'Markdown' }
            );
        } catch (e) { /* ignore */ }
    }
}

// ── BATALKAN ───────────────────────────────────────────
async function batalkanPayment(ctx, orderId, amount) {
    await pakasir.cancelTransaction(orderId, parseInt(amount));
    db.deletePending(`pay_${orderId}`);

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🛍️ Lihat Produk', 'menu_produk')],
        [Markup.button.callback('🏠 Menu Utama', 'menu_utama')]
    ]);

    try {
        await ctx.editMessageCaption('❌ *Pembayaran dibatalkan.*', { parse_mode: 'Markdown', ...keyboard });
    } catch (e) {
        try {
            await ctx.editMessageText('❌ *Pembayaran dibatalkan.*', { parse_mode: 'Markdown', ...keyboard });
        } catch (_) {
            try { await ctx.deleteMessage(); } catch (__) { }
            await ctx.replyWithMarkdown('❌ *Pembayaran dibatalkan.*', keyboard);
        }
    }
    ctx.answerCbQuery('❌ Dibatalkan');
}

module.exports = { beliDenganSaldo, beliViaQRIS, cekStatusPayment, batalkanPayment, prosesOrderSetelahBayar };
