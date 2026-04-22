require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');

// Handlers
const { handleStart, mainMenuKeyboard } = require('./handlers/start');
const { showProductList, showCategoryDetail, showProductsByStock, showProductDetail, showSnk, showStock } = require('./handlers/products');
const { beliDenganSaldo, beliViaQRIS, cekStatusPayment, batalkanPayment, prosesOrderSetelahBayar } = require('./handlers/payment');
const { showDepositMenu, showMetodeDeposit, prosesDeposit, cekStatusDeposit, batalkanDeposit, handleCustomNominal, prosesDepositSetelahBayar } = require('./handlers/deposit');
const { showProfil, showRiwayat, showInfo, showCaraOrder, showFaq } = require('./handlers/profile');
const { showAdminPanel, showAdminProduk, showEditMenu, startEditField, confirmHapusProduk, hapusProduk, showAdminStok, startTambahAkun, startTambahProduk, handleAdminInput, showAdminOrder, showAdminUser, startTambahSaldo, startBroadcast, kirimDetail, isAdmin } = require('./handlers/admin');
const { showLeaderboard } = require('./handlers/leaderboard');
const { escMd } = require('./lib/utils');
const db = require('./lib/db');
const pakasir = require('./lib/pakasir');
const chokidar = require('chokidar');

// ── HOT RELOAD LOGGING MENGGUNAKAN CHOKIDAR ────────────
const watcher = chokidar.watch(['./*.js', './handlers/*.js', './lib/*.js'], {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true
});

watcher.on('change', (path) => {
    console.log(`\n[🔄 UPDATE] File ${path} telah diubah. Restarting/Nodemon sedang memproses...`);
});

const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_PORT = parseInt(process.env.WEBHOOK_PORT) || 25582;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const STORE_NAME = process.env.STORE_NAME || 'BangDet-MD';

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN tidak ditemukan di .env');
    process.exit(1);
}

// ── Watcher File Data (Database JSON) ──────────────────
const dataFilesToWatch = [
    path.join(__dirname, 'products.json'),
    path.join(__dirname, 'data', 'users.json'),
    path.join(__dirname, 'data', 'orders.json'),
    path.join(__dirname, 'data', 'accounts.json'),
    path.join(__dirname, 'data', 'pending.json'),
    path.join(__dirname, 'data', 'deposits.json')
];

dataFilesToWatch.forEach(file => {
    if (fs.existsSync(file)) {
        let fsWait = false;
        fs.watch(file, (event, filename) => {
            if (filename && !fsWait) {
                fsWait = true;
                setTimeout(() => { fsWait = false; }, 1000);
                const time = new Date().toLocaleTimeString('id-ID');
                console.log(`[${time}] 🔄 File diperbarui: ${path.basename(filename)} (tanpa restart)`);
            }
        });
    }
});

const bot = new Telegraf(BOT_TOKEN);

// ── CUSTOM LOGGER ──────────────────────────────────────
bot.use(async (ctx, next) => {
    try {
        if (ctx.from) {
            const time = new Date().toLocaleTimeString('id-ID');
            const senderId = ctx.from.id;
            const senderName = (ctx.from.first_name || '') + (ctx.from.last_name ? ' ' + ctx.from.last_name : '');

            let type = 'Unknown';
            let content = '';

            if (ctx.message?.text) {
                type = ctx.chat?.type === 'private' ? 'Private Chat' : 'Group Chat';
                content = ctx.message.text;
            } else if (ctx.callbackQuery?.data) {
                type = 'Inline Button Click';
                content = ctx.callbackQuery.data;
            } else if (ctx.message?.photo) {
                type = 'Photo Message';
                content = '[Photo/QRIS]';
            } else {
                type = 'Other Update';
                content = Object.keys(ctx.update)[1] || 'Unknown';
            }

            const cZ = '\x1b[0m';  // Reset
            const cW = '\x1b[1;37m'; // White Bold
            const cG = '\x1b[38;5;154m'; // Neon Green
            const cB = '\x1b[38;5;39m';  // Light Blue
            const cR = '\x1b[38;5;196m'; // Red
            const cP = '\x1b[38;5;171m'; // Purple
            const cY = '\x1b[38;5;220m'; // Yellow
            const cC = '\x1b[38;5;87m';  // Cyan

            console.log(`\n           ${cW}# CHAT INFORMATION${cZ}`);
            console.log(`${cG}├────────> ${cY}${time} WIB ${cG}<────────${cZ}`);
            console.log(`${cG}│${cB}➤Type: ${cC}${type}${cZ}`);
            console.log(`${cG}│${cR}➤Sender: ${cR}${senderId}${cZ} | ${cR}~ ${senderName}${cZ}`);
            console.log(`${cG}│${cP}➤Content: ${cP}${content}${cZ}`);
            console.log(`${cG}│${cY}➤From: ${cY}Telegram Bot ${process.env.STORE_NAME || 'BangDet-MD'}${cZ}`);
            console.log(`${cG}├────────────────────────────────${cZ}`);
            console.log(`${cG}│${cZ}`);
            console.log(`${cG}├────────────────────────────────${cZ}`);
            console.log(`⧉ ${cW}${process.env.STORE_NAME || 'BangDet-MD'}${cZ}`);
            console.log();
            console.log(`${cG}+-------------------------------+${cZ}`);
        }
    } catch (e) { }
    return next();
});

// ── ANTI-SPAM (Rate Limiter) ───────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT_MS = 1000; // 1 detik per aksi

bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return next();

    // Jangan limit admin
    if (userId === ADMIN_ID) return next();

    const now = Date.now();
    if (rateLimitMap.has(userId)) {
        const lastTime = rateLimitMap.get(userId);
        if (now - lastTime < RATE_LIMIT_MS) {
            // Jika user spam tombol inline, berikan alert tanpa error
            if (ctx.callbackQuery) {
                return ctx.answerCbQuery('⚠️ Jangan terlalu cepat klik tombol! Tunggu 1 detik ya.', { show_alert: true }).catch(() => { });
            }
            // Abaikan pesan teks beruntun
            return;
        }
    }
    rateLimitMap.set(userId, now);
    return next();
});

// ══════════════════════════════════════════════════════
//  COMMANDS
// ══════════════════════════════════════════════════════

bot.start(handleStart);

bot.command('menu', async (ctx) => {
    await ctx.replyWithMarkdown(`🏠 *Menu Utama ${escMd(STORE_NAME)}*\n\nPilih menu:`, mainMenuKeyboard());
});

bot.command('reset', async (ctx) => {
    const { Markup } = require('telegraf');
    await ctx.reply('🔄 Memperbarui tata letak HP kamu (menghapus keyboard lama)...', Markup.removeKeyboard());
    setTimeout(() => ctx.replyWithMarkdown(`🏠 *Menu Utama ${escMd(STORE_NAME)}*`, mainMenuKeyboard()), 1000);
});

bot.command('saldo', async (ctx) => {
    const user = db.getUser(ctx.from.id);
    const saldo = user ? user.saldo : 0;
    await ctx.reply(`💰 Saldo kamu: Rp ${saldo.toLocaleString('id-ID')}`);
});

bot.command('profil', async (ctx) => {
    // Buat fake ctx untuk showProfil yang butuh .editMessageText
    await showProfil({ ...ctx, answerCbQuery: () => { } });
});

bot.command('admin', async (ctx) => {
    await showAdminPanel(ctx);
});

bot.command('kirim', kirimDetail);

// ══════════════════════════════════════════════════════
//  CALLBACK QUERIES (Tombol Inline)
// ══════════════════════════════════════════════════════

// ── Menu Utama
bot.action('menu_utama', async (ctx) => {
    const userId = ctx.from.id;
    const user = db.getUser(userId);
    const saldo = user ? user.saldo : 0;
    const text = `🏠 *Menu Utama ${escMd(STORE_NAME)}*\n\n💰 Saldo: Rp ${saldo.toLocaleString('id-ID')}\n\nPilih menu:`;
    const opts = { parse_mode: 'Markdown', ...mainMenuKeyboard() };

    try {
        await ctx.editMessageText(text, opts);
        return ctx.answerCbQuery();
    } catch (e) { }

    try {
        await ctx.deleteMessage();
    } catch (_) { }
    await ctx.replyWithMarkdown(text, mainMenuKeyboard());
    ctx.answerCbQuery();
});
bot.action('menu_produk', (ctx) => showProductList(ctx));
bot.action('menu_stok_ready', (ctx) => showProductsByStock(ctx));
bot.action('menu_stock', (ctx) => showStock(ctx));
bot.action(/^kat_(\d+)$/, (ctx) => showCategoryDetail(ctx, ctx.match[1]));
bot.action(/^produk_(\d+)$/, (ctx) => {
    const productId = ctx.match[1];
    showProductDetail(ctx, productId);
});
bot.action('stok_habis', (ctx) => ctx.answerCbQuery('🔴 Stok sedang habis!', { show_alert: true }));
bot.action(/^snk_(\d+)$/, (ctx) => showSnk(ctx, ctx.match[1]));
bot.action(/^beli_saldo_(\d+)$/, (ctx) => {
    beliDenganSaldo(ctx, ctx.match[1]);
});
bot.action(/^beli_qris_(\d+)$/, (ctx) => {
    beliViaQRIS(ctx, ctx.match[1]);
});
bot.action(/^cek_pay_(.+)_(\d+)$/, (ctx) => {
    cekStatusPayment(ctx, ctx.match[1], ctx.match[2]);
});
bot.action(/^batal_pay_(.+)_(\d+)$/, (ctx) => {
    batalkanPayment(ctx, ctx.match[1], ctx.match[2]);
});
bot.action('menu_deposit', (ctx) => showDepositMenu(ctx));
bot.action(/^dep_nominal_(\d+)$/, (ctx) => {
    showMetodeDeposit(ctx, ctx.match[1]);
});
bot.action('dep_custom', handleCustomNominal);
bot.action(/^dep_bayar_(\d+)_(.+)$/, (ctx) => {
    prosesDeposit(ctx, ctx.match[1], ctx.match[2]);
});
bot.action(/^cek_dep_(.+)_(\d+)$/, (ctx) => {
    cekStatusDeposit(ctx, ctx.match[1], ctx.match[2]);
});
bot.action(/^batal_dep_(.+)_(\d+)$/, (ctx) => {
    batalkanDeposit(ctx, ctx.match[1], ctx.match[2]);
});

bot.action('menu_profil', (ctx) => showProfil(ctx));
bot.action('menu_riwayat', (ctx) => showRiwayat(ctx, 0));
bot.action(/^riwayat_page_(\d+)$/, (ctx) => showRiwayat(ctx, parseInt(ctx.match[1])));
bot.action('menu_info', (ctx) => showInfo(ctx));
bot.action('menu_cara_order', (ctx) => showCaraOrder(ctx));
bot.action('menu_faq', (ctx) => showFaq(ctx));
bot.action('menu_leaderboard', (ctx) => showLeaderboard(ctx));
bot.action('adm_panel', (ctx) => showAdminPanel(ctx));
bot.action('adm_produk', (ctx) => showAdminProduk(ctx, 0));
bot.action('adm_stok', (ctx) => showAdminStok(ctx, 0));
bot.action('adm_tambah_produk', (ctx) => startTambahProduk(ctx));
bot.action('adm_order', (ctx) => showAdminOrder(ctx, 0));
bot.action('adm_user', (ctx) => showAdminUser(ctx, 0));
bot.action('adm_saldo', (ctx) => startTambahSaldo(ctx));
bot.action('adm_broadcast', (ctx) => startBroadcast(ctx));
bot.action(/^adm_produk_page_(\d+)$/, (ctx) => showAdminProduk(ctx, parseInt(ctx.match[1])));
bot.action(/^adm_stok_page_(\d+)$/, (ctx) => showAdminStok(ctx, parseInt(ctx.match[1])));
bot.action(/^adm_order_page_(\d+)$/, (ctx) => showAdminOrder(ctx, parseInt(ctx.match[1])));
bot.action(/^adm_user_page_(\d+)$/, (ctx) => showAdminUser(ctx, parseInt(ctx.match[1])));
bot.action(/^adm_edit_(\d+)$/, (ctx) => showEditMenu(ctx, ctx.match[1]));
bot.action(/^adm_edit_(\d+)$/, (ctx) => showEditMenu(ctx, ctx.match[1]));
bot.action(/^adm_edit_(nama|harga|kat|desc|cara|snk)_(\d+)$/, (ctx) => startEditField(ctx, ctx.match[2], ctx.match[1]));
bot.action(/^adm_hapus_(\d+)$/, (ctx) => confirmHapusProduk(ctx, ctx.match[1]));
bot.action(/^adm_hapus_ok_(\d+)$/, (ctx) => hapusProduk(ctx, ctx.match[1]));
bot.action(/^adm_tambah_akun_(\d+)$/, (ctx) => startTambahAkun(ctx, ctx.match[1]));

// ══════════════════════════════════════════════════════
//  TEXT MESSAGE HANDLER (Input bebas dari user)
// ══════════════════════════════════════════════════════

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    // Cek admin input (tambah produk, saldo, broadcast)
    if (isAdmin(userId)) {
        const handled = await handleAdminInput(ctx);
        if (handled) return;
    }

    // Cek pending custom nominal deposit
    const pendingInput = db.getPending(`input_${userId}`);
    if (pendingInput && pendingInput.type === 'awaiting_nominal') {
        const nominal = parseInt(text);
        db.deletePending(`input_${userId}`);

        if (isNaN(nominal) || nominal < 5000) {
            return ctx.reply('❌ Nominal tidak valid. Minimal Rp 5.000');
        }

        // Tampilkan pilihan metode untuk nominal custom
        const { Markup } = require('telegraf');
        const METODE_OPTIONS = [
            { label: '📱 QRIS', value: 'qris' },
            { label: '🏦 BRI VA', value: 'bri_va' },
            { label: '🏦 BNI VA', value: 'bni_va' },
            { label: '🏦 Permata VA', value: 'permata_va' }
        ];
        const rows = METODE_OPTIONS.map(m =>
            [Markup.button.callback(m.label, `dep_bayar_${nominal}_${m.value}`)]
        );
        rows.push([Markup.button.callback('◀️ Kembali', 'menu_deposit')]);
        return ctx.replyWithMarkdown(
            `💰 *Deposit ${formatRupiah(nominal)}*\n\nPilih metode pembayaran:`,
            Markup.inlineKeyboard(rows)
        );
    }

    // Default: tampilkan menu
    if (!text.startsWith('/')) {
        await ctx.replyWithMarkdown(
            `🏠 *${escMd(STORE_NAME)}*\n\nPilih menu:`,
            mainMenuKeyboard()
        );
    }
});

// ══════════════════════════════════════════════════════
//  ERROR HANDLER
// ══════════════════════════════════════════════════════

bot.catch((err, ctx) => {
    console.error(`❌ Error untuk @${ctx.from?.username}:`, err);
});

// ══════════════════════════════════════════════════════
//  WEBHOOK SERVER (Pakasir → konfirmasi bayar otomatis)
// ══════════════════════════════════════════════════════

const app = express();
app.use(express.json());

app.post('/webhook/pakasir', async (req, res) => {
    try {
        const { order_id, amount, status, project } = req.body;
        console.log(`📥 Webhook masuk: ${order_id} | ${status} | ${amount}`);

        const isSuccess = ['completed', 'success', 'settlement'].includes((status || '').toLowerCase());
        if (!isSuccess) {
            return res.json({ ok: true, message: 'Ignored non-completed status' });
        }

        // ── DOUBLE CHECK KEAMANAN (VALIDASI KE SERVER PAKASIR) ──
        const verif = await pakasir.checkTransaction(order_id, parseInt(amount));
        if (!verif.success || !['completed', 'success', 'settlement'].includes((verif.data?.status || '').toLowerCase())) {
            console.error(`🚨 SPOOFING ATTEMPT TERDETEKSI! OrderID: ${order_id}`);
            return res.status(403).json({ ok: false, message: 'Transaction is not completed on server' });
        }

        // Cek apakah deposit
        const depPending = db.getPending(`dep_${order_id}`);
        if (depPending) {
            await prosesDepositSetelahBayar(bot.telegram, order_id);
            return res.json({ ok: true, message: 'Deposit processed' });
        }

        // Cek apakah order / payment
        const payPending = db.getPending(`pay_${order_id}`);
        if (payPending) {
            // Buat fake ctx dengan telegram untuk prosesOrderSetelahBayar
            const fakeCtx = {
                telegram: bot.telegram,
                from: { id: payPending.userId }
            };
            await prosesOrderSetelahBayar(fakeCtx, order_id);
            return res.json({ ok: true, message: 'Order processed' });
        }

        res.json({ ok: true, message: 'No pending found' });
    } catch (err) {
        console.error('❌ Webhook error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        bot: STORE_NAME,
        time: new Date().toISOString()
    });
});

// ══════════════════════════════════════════════════════
//  JALANKAN BOT
// ══════════════════════════════════════════════════════

const { startCronJobs } = require('./lib/cron');
const { showWatermark: bootstrapSystem } = require('./lib/bootstrap');

async function main() {
    await bootstrapSystem();

    // Daftarkan commands (muncul di tombol ⌘ mobile & desktop)
    await bot.telegram.setMyCommands([
        { command: 'start', description: '🏠 Mulai / Menu Utama' },
        { command: 'menu', description: '🏠 Tampilkan Menu' },
        { command: 'saldo', description: '💰 Cek Saldo' },
        { command: 'profil', description: '👤 Lihat Profil' },
        { command: 'admin', description: '🛠️ Panel Admin (khusus admin)' }
    ]);

    // Jalankan webhook server
    const server = app.listen(WEBHOOK_PORT, () => {
        const publicUrl = process.env.WEBHOOK_PUBLIC_URL
            ? `${process.env.WEBHOOK_PUBLIC_URL}/webhook/pakasir`
            : `(Atur WEBHOOK_PUBLIC_URL di .env untuk melihat URL publik)`;
        console.log(`🌐 Webhook server berjalan di port ${WEBHOOK_PORT}`);
        console.log(`   Endpoint: ${publicUrl}`);
    });
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`⚠️  Port ${WEBHOOK_PORT} sudah dipakai. Matikan proses lama dulu.`);
            console.warn(`   Jalankan: npx kill-port ${WEBHOOK_PORT}`);
        } else {
            console.error('❌ Webhook server error:', err.message);
        }
    });


    // Mulai background cron jobs
    startCronJobs(bot.telegram);

    // Jalankan bot (long polling)
    await bot.launch();
    console.log(`✅ Bot ${STORE_NAME} berjalan!`);
    console.log(`📱 Token: ${BOT_TOKEN.substring(0, 10)}...`);
    console.log(`👤 Admin ID: ${ADMIN_ID}`);
}

main().catch(err => {
    console.error('❌ Gagal menjalankan bot:', err);
    process.exit(1);
});

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
