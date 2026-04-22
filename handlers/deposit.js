const { Markup } = require('telegraf');
const db = require('../lib/db');
const pakasir = require('../lib/pakasir');
const { generateQRBuffer } = require('../lib/qris');
const { generateOrderId, formatDate, escMd } = require('../lib/utils');
const { formatHarga } = require('./products');

const ADMIN_ID = parseInt(process.env.ADMIN_ID);

const NOMINAL_OPTIONS = [
    { label: 'Rp 5.000', value: 5000 },
    { label: 'Rp 10.000', value: 10000 },
    { label: 'Rp 20.000', value: 20000 },
    { label: 'Rp 50.000', value: 50000 },
    { label: 'Rp 100.000', value: 100000 },
    { label: 'Rp 200.000', value: 200000 },
    { label: 'Rp 500.000', value: 500000 },
    { label: 'Rp 1.000.000', value: 1000000 }
];

const METODE_OPTIONS = [
    { label: '📱  QRIS', value: 'qris' },
    { label: '🏦  BRI VA', value: 'bri_va' },
    { label: '🏦  BNI VA', value: 'bni_va' },
    { label: '🏦  Permata VA', value: 'permata_va' }
];

// ── Helper edit/hapus+kirim ─────────────────────────────
async function editOrReply(ctx, text, keyboard) {
    try {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    } catch (e) {
        try { await ctx.deleteMessage(); } catch (_) { }
        await ctx.replyWithMarkdown(text, keyboard);
    }
}

// ── MENU DEPOSIT ───────────────────────────────────────
async function showDepositMenu(ctx) {
    const user = db.getUser(ctx.from.id);
    const saldo = user ? user.saldo : 0;

    if (db.hasPendingTransaction(ctx.from.id)) {
        return ctx.answerCbQuery('❌ Selesaikan atau batalkan tagihan kamu sebelumnya!', { show_alert: true });
    }

    const text =
        `💰 *TOP UP SALDO*\n${'─'.repeat(28)}\n\n` +
        `💳 Saldo kamu: *Rp ${saldo.toLocaleString('id-ID')}*\n\n` +
        `Pilih nominal yang ingin ditambahkan:`;

    // Grid 2 kolom untuk nominal
    const rows = [];
    for (let i = 0; i < NOMINAL_OPTIONS.length; i += 2) {
        const pair = NOMINAL_OPTIONS.slice(i, i + 2).map(opt =>
            Markup.button.callback(opt.label, `dep_nominal_${opt.value}`)
        );
        rows.push(pair);
    }
    rows.push([Markup.button.callback('✏️  Nominal Lain', 'dep_custom')]);
    rows.push([Markup.button.callback('🏠  Menu Utama', 'menu_utama')]);

    await editOrReply(ctx, text, Markup.inlineKeyboard(rows));
    ctx.answerCbQuery();
}

// ── PILIH METODE ───────────────────────────────────────
async function showMetodeDeposit(ctx, nominal) {
    const nom = parseInt(nominal);
    const text =
        `💰 *PILIH METODE PEMBAYARAN*\n${'─'.repeat(28)}\n\n` +
        `Nominal: *${formatHarga(nom)}*\n\n` +
        `Pilih metode:`;

    const rows = [];
    for (let i = 0; i < METODE_OPTIONS.length; i += 2) {
        const pair = METODE_OPTIONS.slice(i, i + 2).map(m =>
            Markup.button.callback(m.label, `dep_bayar_${nom}_${m.value}`)
        );
        rows.push(pair);
    }
    rows.push([
        Markup.button.callback('◀️  Kembali', 'menu_deposit'),
        Markup.button.callback('🏠  Menu Utama', 'menu_utama')
    ]);

    await editOrReply(ctx, text, Markup.inlineKeyboard(rows));
    ctx.answerCbQuery();
}

// ── PROSES DEPOSIT ─────────────────────────────────────
async function prosesDeposit(ctx, nominal, method) {
    const userId = ctx.from.id;
    const nom = parseInt(nominal);

    await ctx.answerCbQuery('⏳ Membuat transaksi...');

    const orderId = generateOrderId('DEP');
    const result = await pakasir.createTransaction(orderId, nom, method);

    if (!result.success) {
        const csUsername = process.env.CS_USERNAME ? process.env.CS_USERNAME.replace('@', '') : '';
        const btnHubungiCS = csUsername ? [Markup.button.url('📞 Hubungi CS', `https://t.me/${csUsername}`)] : [];

        await editOrReply(ctx,
            `❌ *Gagal membuat transaksi*\n\n${escMd(result.error)}`,
            Markup.inlineKeyboard([
                btnHubungiCS,
                [Markup.button.callback('◀️  Kembali', 'menu_deposit')]
            ])
        );
        return;
    }

    const data = result.data;

    db.createDeposit({
        orderId, userId, amount: nom,
        totalPayment: data.total_payment, paymentMethod: method
    });

    db.savePending(`dep_${orderId}`, {
        type: 'deposit', orderId, userId, amount: nom,
        totalPayment: data.total_payment, paymentMethod: method, expiredAt: data.expired_at
    });

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Cek Status', `cek_dep_${orderId}_${nom}`), Markup.button.callback('❌ Batal', `batal_dep_${orderId}_${nom}`)],
        [Markup.button.callback('🏠 Beranda', 'menu_utama')]
    ]);

    if (method === 'qris') {
        try { await ctx.deleteMessage(); } catch (_) { }

        let qrBuffer;
        try { qrBuffer = await generateQRBuffer(data.payment_number); } catch (e) { qrBuffer = null; }

        const caption =
            `> 📱 *SCAN QRIS — DEPOSIT*\n> ─────────────────\n` +
            `> Nominal : *${formatHarga(nom)}*\n` +
            `> Bayar   : *${formatHarga(data.total_payment)}*\n` +
            `> Expired : ${formatDate(data.expired_at)}\n> ─────────────────\n\n` +
            `_Saldo terisi otomatis setelah pembayaran sukses._`;

        if (qrBuffer) {
            await ctx.replyWithPhoto({ source: qrBuffer, filename: 'deposit_qris.png' },
                { caption, parse_mode: 'Markdown', ...keyboard }
            );
        } else {
            await ctx.replyWithMarkdown(`${caption}\n\n\`${data.payment_number}\``, keyboard);
        }
    } else {
        const methodLabel = METODE_OPTIONS.find(m => m.value === method)?.label || method;
        const text =
            `> 🏦 *TRANSFER — DEPOSIT*\n> ─────────────────\n` +
            `> Metode  : *${escMd(methodLabel)}*\n` +
            `> Nominal : *${formatHarga(nom)}*\n` +
            `> Bayar   : *${formatHarga(data.total_payment)}*\n> ─────────────────\n` +
            `> No VA   : \`${data.payment_number}\`\n> ─────────────────\n\n` +
            `_Saldo terisi otomatis setelah transfer sukses._`;

        await editOrReply(ctx, text, keyboard);
    }
}

// ── CEK DEPOSIT ────────────────────────────────────────
async function cekStatusDeposit(ctx, orderId, amount) {
    const result = await pakasir.checkTransaction(orderId, parseInt(amount));
    if (!result.success) {
        console.error('Gagal cek status deposit:', result.error);
        return ctx.answerCbQuery(`❌ Gagal cek status: ${result.error}`, { show_alert: true });
    }

    const isSuccess = ['completed', 'success', 'settlement'].includes((result.data?.status || '').toLowerCase());
    if (isSuccess) {
        await prosesDepositSetelahBayar(ctx.telegram, orderId);
        try {
            await ctx.editMessageCaption('✅ *Deposit berhasil! Saldo sudah terisi.*', {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('🏠  Menu Utama', 'menu_utama')]])
            });
        } catch (e) {
            try {
                await ctx.editMessageText('✅ *Deposit berhasil! Saldo sudah terisi.*', {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([[Markup.button.callback('🏠  Menu Utama', 'menu_utama')]])
                });
            } catch (_) { }
        }
        ctx.answerCbQuery('✅ Deposit berhasil!', { show_alert: true });
    } else {
        ctx.answerCbQuery('⏳ Belum terbayar. Selesaikan pembayaran dulu.', { show_alert: true });
    }
}

// ── PROSES DARI WEBHOOK ────────────────────────────────
async function prosesDepositSetelahBayar(telegram, orderId) {
    const pending = db.getPending(`dep_${orderId}`);
    if (!pending) return;

    const saldoBaru = db.tambahSaldo(pending.userId, pending.amount);
    db.updateDeposit(orderId, { status: 'completed', completedAt: new Date().toISOString() });
    db.deletePending(`dep_${orderId}`);

    await telegram.sendMessage(pending.userId,
        `✅ *DEPOSIT BERHASIL!*\n${'─'.repeat(28)}\n\n` +
        `💵 Nominal: *${formatHarga(pending.amount)}*\n` +
        `💰 Saldo sekarang: *${formatHarga(saldoBaru)}*\n\n` +
        `Terima kasih sudah top up di ${escMd(process.env.STORE_NAME || 'BangDet-MD')}! 💛`,
        { parse_mode: 'Markdown' }
    );

    if (ADMIN_ID) {
        try {
            await telegram.sendMessage(ADMIN_ID,
                `💰 *DEPOSIT MASUK*\n👤 User: ${pending.userId}\n💵 ${formatHarga(pending.amount)}\n🆔 ${orderId}`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) { }
    }
}

// ── BATALKAN DEPOSIT ───────────────────────────────────
async function batalkanDeposit(ctx, orderId, amount) {
    await pakasir.cancelTransaction(orderId, parseInt(amount));
    db.deletePending(`dep_${orderId}`);
    db.updateDeposit(orderId, { status: 'cancelled' });

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('💰 Deposit Lagi', 'menu_deposit'), Markup.button.callback('🏠 Beranda', 'menu_utama')]
    ]);

    try { await ctx.editMessageCaption('❌ *Deposit dibatalkan.*', { parse_mode: 'Markdown', ...keyboard }); }
    catch (e) {
        try { await ctx.editMessageText('❌ *Deposit dibatalkan.*', { parse_mode: 'Markdown', ...keyboard }); }
        catch (_) { await ctx.replyWithMarkdown('❌ *Deposit dibatalkan.*', keyboard); }
    }
    ctx.answerCbQuery('❌ Dibatalkan');
}

// ── CUSTOM NOMINAL ─────────────────────────────────────
async function handleCustomNominal(ctx) {
    if (db.hasPendingTransaction(ctx.from.id)) {
        return ctx.answerCbQuery('❌ Selesaikan atau batalkan tagihan kamu sebelumnya!', { show_alert: true });
    }
    
    ctx.answerCbQuery();
    db.savePending(`input_${ctx.from.id}`, { type: 'awaiting_nominal', userId: ctx.from.id });

    await editOrReply(ctx,
        `✏️ *NOMINAL DEPOSIT CUSTOM*\n${'─'.repeat(28)}\n\nKetik jumlah yang ingin ditambahkan:\n\nContoh: \`75000\`\n\n_Minimal Rp 5.000_`,
        Markup.inlineKeyboard([[Markup.button.callback('❌  Batal', 'menu_deposit')]])
    );
}

module.exports = {
    showDepositMenu, showMetodeDeposit, prosesDeposit,
    cekStatusDeposit, prosesDepositSetelahBayar,
    batalkanDeposit, handleCustomNominal
};
