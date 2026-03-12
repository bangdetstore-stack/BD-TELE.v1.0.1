const { Markup } = require('telegraf');
const db = require('../lib/db');
const pakasir = require('../lib/pakasir');
const { generateQRBuffer } = require('../lib/qris');
const { generateOrderId, formatDate, escMd } = require('../lib/utils');
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const TESTI_CHANNEL_ID = process.env.TESTI_CHANNEL_ID || '';
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '';
const STORE_NAME = process.env.STORE_NAME || 'Diera Store';

// Simple Lock Mechanism to prevent race conditions during purchase
const transactionLocks = new Set();

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
        
        const csUsername = process.env.CS_USERNAME ? process.env.CS_USERNAME.replace('@', '') : '';
        const btnHubungiCS = csUsername ? [Markup.button.url('📞 Hubungi CS', `https://t.me/${csUsername}`)] : [];

        try {
            await ctx.editMessageText(
                `❌ *Saldo Tidak Cukup*\n\n💵 Harga: ${formatHarga(p.harga)}\n💰 Saldo kamu: ${formatHarga(user.saldo)}\n📉 Kurang: ${formatHarga(kurang)}`,
                {
                    parse_mode: 'Markdown', ...Markup.inlineKeyboard([
                        [Markup.button.callback('💰 Deposit Sekarang', 'menu_deposit')],
                        btnHubungiCS,
                        [Markup.button.callback('◀️ Kembali', `produk_${p.id}`)]
                    ])
                }
            );
        } catch (e) {
            try { await ctx.deleteMessage(); } catch (_) { }
            await ctx.replyWithMarkdown(
                `❌ *Saldo Tidak Cukup*\n\n💵 Harga: ${formatHarga(p.harga)}\n💰 Saldo: ${formatHarga(user.saldo)}\n📉 Kurang: ${formatHarga(kurang)}`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('💰 Deposit', 'menu_deposit')],
                    btnHubungiCS
                ])
            );
        }
        return;
    }

    // ── PREVENTION OF RACE CONDITION ──
    const lockKey = `buy_${productId}`;
    if (transactionLocks.has(lockKey)) {
        return ctx.answerCbQuery('⏳ Sistem sedang memproses order lain untuk produk ini. Coba lagi dalam 3 detik.', { show_alert: true });
    }
    transactionLocks.add(lockKey);

    ctx.answerCbQuery('⏳ Memproses...');
    const orderId = generateOrderId('ORD');

    try {
        // Ambil akun dari database
        const akunDetail = db.takeAccount(p.id, orderId);
        
        // Double check stok di dalam lock (kasus jika stok sisa 1 dan lock baru terbuka)
        if (!akunDetail && stok > 0 && db.getStock(p.id) <= 0) {
            transactionLocks.delete(lockKey);
            return ctx.reply('❌ Maaf, stok baru saja habis.');
        }

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

    // Digital Receipt format
    let successText =
        `==========================\n` +
        `✅ TRANSAKSI BERHASIL ✅\n` +
        `==========================\n\n` +
        `🆔 Order ID: \`${orderId}\`\n` +
        `🏷️ Produk  : *${p.nama}*\n` +
        `💵 Harga   : ${formatHarga(p.harga)}\n` +
        `💳 Metode  : Saldo\n` +
        `--------------------------\n` +
        `💰 Sisa Saldo: ${formatHarga(newSaldo)}\n\n`;

    if (akunDetail) {
        successText += `📦 *Detail Akun:*\n\`\`\`\n${akunDetail}\n\`\`\`\n\n`;
        // ... (cara penggunaan dan snk logic tetap, digabungkan dibawah)
    } else {
        successText += `📦 Admin akan segera mengirimkan detail akun.\n\n`;
    }

    if (akunDetail && p.cara_penggunaan && p.cara_penggunaan !== '-') {
        successText += `📌 *Cara Penggunaan:*\n${p.cara_penggunaan}\n\n`;
    }
    if (akunDetail && p.snk && p.snk !== '-') {
        successText += `📋 *S&K:*\n${p.snk}\n\n`;
    }
    
    successText += `_Terima kasih telah berbelanja di ${escMd(STORE_NAME)}! 💛_`;

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
                `🛒 *ORDER BARU*\n\n👤 ${escMd(ctx.from.first_name)} (${userId})\n🏷️ ${p.nama}\n💵 ${formatHarga(p.harga)}\n💳 Saldo\n🆔 \`${orderId}\``,
                { parse_mode: 'Markdown' }
            );
        } catch (e) { /* ignore */ }
    }

    // Broadcast ke Channel Testi Live
    if (TESTI_CHANNEL_ID) {
        try {
            const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
            const maskName = userName.slice(0, 3) + '***' + userName.slice(-1);
            await ctx.telegram.sendMessage(TESTI_CHANNEL_ID,
                `🎉 *Sukses Pembelian!*\n\n👤 Pembeli: ${escMd(maskName)}\n🛒 Produk: *${p.nama}*\n💳 Metode: Saldo`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) { console.error('Gagal broadcast testi:', e.message); }
    }

    // Logger Transaksi ke Channel Log
    if (LOG_CHANNEL_ID) {
        try {
            const userName = ctx.from.username ? `@${ctx.from.username}` : '';
            await ctx.telegram.sendMessage(LOG_CHANNEL_ID,
                `🛒 *LOG TRANSAKSI SALDO*\n\n👤 User: *${escMd(ctx.from.first_name)}* ${escMd(userName)} (\`${userId}\`)\n🏷️ Produk: *${p.nama}*\n💵 Harga: ${formatHarga(p.harga)}\n🆔 OrderID: \`${orderId}\``,
                { parse_mode: 'Markdown' }
            );
        } catch (e) { console.error('Gagal broadcast log:', e.message); }
    }
    
    } finally {
        transactionLocks.delete(lockKey);
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

    // ── PREVENTION OF RACE CONDITION ──
    const lockKey = `buy_${productId}`;
    if (transactionLocks.has(lockKey)) {
        return ctx.reply('⏳ Sistem sedang memproses order lain untuk produk ini. Coba lagi dalam beberapa detik.');
    }
    transactionLocks.add(lockKey);

    try {
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
    } finally {
        transactionLocks.delete(lockKey);
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
        `==========================\n` +
        `✅ TRANSAKSI BERHASIL ✅\n` +
        `==========================\n\n` +
        `🆔 Order ID: \`${orderId}\`\n` +
        `🏷️ Produk  : *${p.nama}*\n` +
        `💵 Harga   : ${formatHarga(pending.originalAmount)}\n` +
        `💳 Metode  : QRIS\n` +
        `--------------------------\n\n`;

    if (akunDetail) {
        successText += `📦 *Detail Akun:*\n\`\`\`\n${akunDetail}\n\`\`\`\n\n`;
    } else {
        successText += `📦 Admin akan dikirimkan detail akun segera.\n\n`;
    }

    if (akunDetail && p.cara_penggunaan && p.cara_penggunaan !== '-') {
        successText += `📌 *Cara Penggunaan:*\n${p.cara_penggunaan}\n\n`;
    }
    if (akunDetail && p.snk && p.snk !== '-') {
        successText += `📋 *S&K:*\n${p.snk}\n\n`;
    }
    
    successText += `_Terima kasih telah berbelanja di ${escMd(STORE_NAME)}! 💛_`;

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

    // Notif admin
    if (ADMIN_ID) {
        try {
            await ctx.telegram.sendMessage(ADMIN_ID,
                `💰 *QRIS BAYAR SUKSES*\n\n👤 ${userId}\n🏷️ ${p.nama}\n💵 ${formatHarga(pending.originalAmount)}\n🆔 \`${orderId}\``,
                { parse_mode: 'Markdown' }
            );
        } catch (e) { /* ignore */ }
    }

    // Broadcast ke Channel Testi Live
    if (TESTI_CHANNEL_ID) {
        try {
            // Masking User ID as Name since we only have UserID for webhook callback ctx
            const maskName = String(userId).slice(0, 3) + '***' + String(userId).slice(-2);
            await ctx.telegram.sendMessage(TESTI_CHANNEL_ID,
                `🎉 *Sukses Pembelian!*\n\n👤 Pembeli: ${escMd(maskName)}\n🛒 Produk: *${p.nama}*\n💳 Metode: QRIS`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) { console.error('Gagal broadcast testi:', e.message); }
    }

    // Logger Transaksi ke Channel Log
    if (LOG_CHANNEL_ID) {
        try {
            await ctx.telegram.sendMessage(LOG_CHANNEL_ID,
                `🛒 *LOG TRANSAKSI QRIS*\n\n👤 UserID: \`${userId}\`\n🏷️ Produk: *${p.nama}*\n💵 Harga: ${formatHarga(pending.originalAmount)}\n🆔 OrderID: \`${orderId}\``,
                { parse_mode: 'Markdown' }
            );
        } catch (e) { console.error('Gagal broadcast log:', e.message); }
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
