const { Markup } = require('telegraf');
const db = require('../lib/db');
const { formatDate, statusEmoji } = require('../lib/utils');
const { getProducts, saveProducts, formatHarga } = require('./products');

const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const STORE_NAME = process.env.STORE_NAME || 'Diera Store';
const ORDER_PAGE_SIZE = 8;
const USER_PAGE_SIZE = 10;
const PRODUK_PAGE_SIZE = 5;

function isAdmin(userId) { return userId === ADMIN_ID; }

const trunc = (str, n = 70) => str && str.length > n ? str.slice(0, n) + '...' : (str || '-');

// ── PANEL ADMIN — edit-or-reply agar tidak menumpuk ────
async function showAdminPanel(ctx) {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Kamu bukan admin!');

    const users = db.getAllUsers();
    const orders = db.getAllOrders(9999);
    const products = getProducts();
    const completedOrders = orders.filter(o => o.status === 'completed').length;
    const totalStok = products.reduce((sum, p) => sum + db.getStock(p.id), 0);

    const text =
        `🛠️ *PANEL ADMIN*\n${STORE_NAME}\n${'─'.repeat(28)}\n\n` +
        `👥 User: *${users.length}*\n` +
        `🛒 Order: *${orders.length}* (✅ ${completedOrders} selesai)\n` +
        `📦 Produk: *${products.length}* | Stok: *${totalStok}* slot`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('📦  Kelola Produk', 'adm_produk'),
            Markup.button.callback('🔑  Stok Akun', 'adm_stok')
        ],
        [
            Markup.button.callback('🛒  Data Order', 'adm_order'),
            Markup.button.callback('👥  Data User', 'adm_user')
        ],
        [
            Markup.button.callback('💰  Tambah Saldo', 'adm_saldo'),
            Markup.button.callback('📢  Broadcast', 'adm_broadcast')
        ],
        [Markup.button.callback('🏠  Menu Utama', 'menu_utama')]
    ]);

    // Edit-or-reply: hindari pesan menumpuk
    try { await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard }); }
    catch (e) { await ctx.replyWithMarkdown(text, keyboard); }
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});
}

// ── KELOLA PRODUK — 5 per halaman ─────────────────────
async function showAdminProduk(ctx, page = 0) {
    if (!isAdmin(ctx.from.id)) return;
    const products = getProducts();
    const totalPages = Math.max(1, Math.ceil(products.length / PRODUK_PAGE_SIZE));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const slice = products.slice(safePage * PRODUK_PAGE_SIZE, (safePage + 1) * PRODUK_PAGE_SIZE);

    let text = `📦 *KELOLA PRODUK*\nHalaman ${safePage + 1}/${totalPages} | Total: ${products.length}\n${'─'.repeat(28)}\n\n`;
    
    const rows = [];
    let currentRow = [];

    slice.forEach((p, i) => {
        const no = safePage * PRODUK_PAGE_SIZE + i + 1;
        const stok = db.getStock(p.id);
        text += `*${no}.* ${p.nama}\n   💵 ${formatHarga(p.harga)} | 📦 ${stok} slot\n\n`;
        
        currentRow.push(Markup.button.callback(`${no}`, `adm_edit_${p.id}`));
        if (currentRow.length === 5) {
            rows.push(currentRow);
            currentRow = [];
        }
    });
    
    if (currentRow.length > 0) rows.push(currentRow);

    text += `_Pilih nomor produk untuk edit:_`;

    const navRow = [];
    if (safePage > 0) navRow.push(Markup.button.callback('◀️  Sebelumnya', `adm_produk_page_${safePage - 1}`));
    if (safePage < totalPages - 1) navRow.push(Markup.button.callback('Selanjutnya  ▶️', `adm_produk_page_${safePage + 1}`));
    if (navRow.length > 0) rows.push(navRow);

    rows.push([Markup.button.callback('➕  Tambah Produk Baru', 'adm_tambah_produk')]);
    rows.push([Markup.button.callback('◀️  Panel Admin', 'adm_panel')]);

    try { await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) }); }
    catch (e) { await ctx.replyWithMarkdown(text, Markup.inlineKeyboard(rows)); }
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});
}

// ── EDIT MENU PRODUK ──────────────────────────────────
async function showEditMenu(ctx, productId) {
    if (!isAdmin(ctx.from.id)) return;
    const products = getProducts();
    const p = products.find(x => x.id === parseInt(productId));
    if (!p) return ctx.answerCbQuery('❌ Produk tidak ditemukan', { show_alert: true });

    const stok = db.getStock(p.id);
    const text =
        `✏️ *EDIT PRODUK*\n${'─'.repeat(28)}\n\n` +
        `🏷️ *Nama:*\n${p.nama}\n\n` +
        `💵 *Harga:* ${formatHarga(p.harga)}  |  📦 *Stok:* ${stok} slot\n` +
        `🗂️ *Kategori:* ${p.kategori || '-'}\n\n` +
        `📝 *Deskripsi:*\n${trunc(p.deskripsi)}\n\n` +
        `📌 *Cara Pakai:*\n${trunc(p.cara_penggunaan)}\n\n` +
        `📋 *S&K:*\n${trunc(p.snk)}\n\n` +
        `_Pilih field yang ingin diedit:_`;

    try {
        await ctx.editMessageText(text, {
            parse_mode: 'Markdown', ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('✏️  Nama', `adm_edit_nama_${p.id}`),
                    Markup.button.callback('💵  Harga', `adm_edit_harga_${p.id}`)
                ],
                [
                    Markup.button.callback('🗂️  Kategori', `adm_edit_kat_${p.id}`),
                    Markup.button.callback('📝  Deskripsi', `adm_edit_desc_${p.id}`)
                ],
                [
                    Markup.button.callback('📌  Cara Pakai', `adm_edit_cara_${p.id}`),
                    Markup.button.callback('📋  S&K', `adm_edit_snk_${p.id}`)
                ],
                [Markup.button.callback('🗑️  Hapus Produk', `adm_hapus_${p.id}`)],
                [Markup.button.callback('◀️  Kembali', 'adm_produk')]
            ])
        });
    } catch (e) { await ctx.replyWithMarkdown(text); }
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});
}

// ── MULAI EDIT FIELD ──────────────────────────────────
async function startEditField(ctx, productId, field) {
    if (!isAdmin(ctx.from.id)) return;
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});

    const fieldLabels = {
        nama: 'Nama Produk',
        harga: 'Harga (angka saja, contoh: 45000)',
        kat: 'Kategori (contoh: Streaming, AI, Desain)',
        desc: 'Deskripsi',
        cara: 'Cara Penggunaan',
        snk: 'Syarat & Ketentuan (S&K)\n\nGunakan baris baru untuk setiap poin:'
    };

    db.savePending(`adm_${ctx.from.id}`, { type: 'edit_product', productId, field });

    const products = getProducts();
    const p = products.find(x => x.id === parseInt(productId));
    const fieldMap = { nama: 'nama', harga: 'harga', kat: 'kategori', desc: 'deskripsi', cara: 'cara_penggunaan', snk: 'snk' };
    const key = fieldMap[field];
    const oldValue = p ? (p[key] || '-') : '-';
    const displayOld = field === 'harga' && oldValue !== '-' ? formatHarga(oldValue) : oldValue;

    const label = fieldLabels[field] || field;
    const text = `✏️ *Edit ${label}*\n\n` + 
                 `🔹 *Nilai Lama:*\n${displayOld}\n\n` +
                 `Ketik nilai baru:`;

    try {
        await ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('❌  Batal', `adm_edit_${productId}`)]])
        });
    } catch (e) {
        await ctx.replyWithMarkdown(text, Markup.inlineKeyboard([[Markup.button.callback('❌  Batal', `adm_edit_${productId}`)]]));
    }
}

// ── KONFIRMASI HAPUS PRODUK ────────────────────────────
async function confirmHapusProduk(ctx, productId) {
    if (!isAdmin(ctx.from.id)) return;
    const products = getProducts();
    const p = products.find(x => x.id === parseInt(productId));
    if (!p) return;

    const text =
        `🗑️ *HAPUS PRODUK*\n\n` +
        `Yakin ingin menghapus:\n*${p.nama}*?\n\n` +
        `⚠️ Stok akun yang tersisa juga akan terhapus!`;

    try {
        await ctx.editMessageText(text, {
            parse_mode: 'Markdown', ...Markup.inlineKeyboard([
                [Markup.button.callback('✅  Ya, Hapus', `adm_hapus_ok_${productId}`)],
                [Markup.button.callback('❌  Batal', `adm_edit_${productId}`)]
            ])
        });
    } catch (e) { await ctx.replyWithMarkdown(text); }
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});
}

// ── EKSEKUSI HAPUS PRODUK ─────────────────────────────
async function hapusProduk(ctx, productId) {
    if (!isAdmin(ctx.from.id)) return;
    const products = getProducts();
    const idx = products.findIndex(x => x.id === parseInt(productId));
    if (idx === -1) return;

    const nama = products[idx].nama;
    products.splice(idx, 1);
    saveProducts(products);
    db.clearAccounts(productId);

    try {
        await ctx.editMessageText(`✅ *Produk dihapus:*\n${nama}`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('📦  Kelola Produk', 'adm_produk')]])
        });
    } catch (e) { await ctx.replyWithMarkdown(`✅ *Produk dihapus:* ${nama}`); }
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});
}

// ── STOK AKUN ──────────────────────────────────────────
async function showAdminStok(ctx) {
    if (!isAdmin(ctx.from.id)) return;
    const products = getProducts();

    let text = `🔑 *MANAJEMEN STOK AKUN*\n${'─'.repeat(28)}\n\n`;
    products.forEach((p, i) => {
        const stok = db.getStock(p.id);
        text += `${stok > 0 ? '✅' : '🔴'} *${i + 1}.* ${p.nama} — ${stok} slot\n`;
    });
    text += `\nPilih produk untuk tambah akun:`;

    const rows = products.map(p => {
        const stok = db.getStock(p.id);
        return [Markup.button.callback(`➕  ${p.nama.substring(0, 24)} (${stok})`, `adm_tambah_akun_${p.id}`)];
    });
    rows.push([Markup.button.callback('◀️  Panel Admin', 'adm_panel')]);

    try { await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) }); }
    catch (e) { await ctx.replyWithMarkdown(text, Markup.inlineKeyboard(rows)); }
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});
}

// ── MULAI TAMBAH AKUN ──────────────────────────────────
async function startTambahAkun(ctx, productId) {
    if (!isAdmin(ctx.from.id)) return;
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});

    const products = getProducts();
    const p = products.find(x => x.id === parseInt(productId));
    if (!p) return;

    db.savePending(`adm_${ctx.from.id}`, { type: 'add_account', productId: p.id, productName: p.nama });

    const currentStok = db.getStock(p.id);
    const text =
        `🔑 *TAMBAH AKUN — ${p.nama}*\n\n` +
        `Stok saat ini: *${currentStok} slot*\n\n` +
        `Kirim daftar akun, *satu per baris*:\n` +
        `\`\`\`\nemail1@gmail.com|password1\nemail2@gmail.com|password2\n\`\`\`\n\n` +
        `_Setiap baris = 1 slot akun._`;

    try {
        await ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('❌  Batal', 'adm_stok')]])
        });
    } catch (e) {
        await ctx.replyWithMarkdown(text, Markup.inlineKeyboard([[Markup.button.callback('❌  Batal', 'adm_stok')]]));
    }
}

// ── TAMBAH PRODUK BARU ─────────────────────────────────
async function startTambahProduk(ctx) {
    if (!isAdmin(ctx.from.id)) return;
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});
    db.savePending(`adm_${ctx.from.id}`, { type: 'add_product', step: 'nama' });
    try {
        await ctx.editMessageText(`➕ *TAMBAH PRODUK BARU*\n\nKetik nama produk:`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('❌  Batal', 'adm_produk')]])
        });
    } catch (e) { await ctx.replyWithMarkdown(`➕ *TAMBAH PRODUK BARU*\n\nKetik nama produk:`); }
}

// ── HANDLE TEXT INPUT ADMIN ────────────────────────────
async function handleAdminInput(ctx) {
    if (!isAdmin(ctx.from.id)) return false;
    const text = ctx.message.text;
    const pending = db.getPending(`adm_${ctx.from.id}`);
    if (!pending) return false;

    if (pending.type === 'edit_product') {
        const products = getProducts();
        const idx = products.findIndex(x => x.id === parseInt(pending.productId));
        if (idx === -1) { db.deletePending(`adm_${ctx.from.id}`); return true; }

        const fieldMap = { nama: 'nama', harga: 'harga', kat: 'kategori', desc: 'deskripsi', cara: 'cara_penggunaan', snk: 'snk' };
        const key = fieldMap[pending.field];
        const oldValue = products[idx][key] || '-';

        if (pending.field === 'harga') {
            const val = parseInt(text);
            if (isNaN(val)) { await ctx.reply('❌ Harga tidak valid (angka saja):'); return true; }
            products[idx][key] = val;
        } else {
            products[idx][key] = text;
        }
        
        const newValue = products[idx][key];
        const displayOld = pending.field === 'harga' && oldValue !== '-' ? formatHarga(oldValue) : oldValue;
        const displayNew = pending.field === 'harga' ? formatHarga(newValue) : newValue;

        saveProducts(products);
        db.deletePending(`adm_${ctx.from.id}`);
        const p = products[idx];
        await ctx.replyWithMarkdown(
            `✅ *Produk ${pending.field} diperbarui!*\n\n🏷️ ${p.nama}\n\n` +
            `🔹 *Lama:* ${displayOld}\n` +
            `🔸 *Baru:* ${displayNew}`,
            Markup.inlineKeyboard([
                [Markup.button.callback('✏️  Edit Lagi', `adm_edit_${p.id}`)],
                [Markup.button.callback('📦  Daftar Produk', 'adm_produk')]
            ])
        );
        return true;
    }

    if (pending.type === 'add_account') {
        const lines = text.split('\n').filter(l => l.trim());
        const added = db.addAccounts(pending.productId, lines);
        db.deletePending(`adm_${ctx.from.id}`);
        const newStok = db.getStock(pending.productId);
        await ctx.replyWithMarkdown(
            `✅ *${added} akun berhasil ditambahkan!*\n\n📦 ${pending.productName}\n🔢 Total stok: *${newStok} slot*`,
            Markup.inlineKeyboard([
                [Markup.button.callback('🔑  Kelola Stok Lagi', 'adm_stok')],
                [Markup.button.callback('◀️  Panel Admin', 'adm_panel')]
            ])
        );
        return true;
    }

    if (pending.type === 'add_product') {
        if (pending.step === 'nama') {
            db.savePending(`adm_${ctx.from.id}`, { ...pending, step: 'harga', nama: text });
            await ctx.reply('Harga produk? (angka saja, contoh: 45000)');
            return true;
        }
        if (pending.step === 'harga') {
            const harga = parseInt(text);
            if (isNaN(harga)) { await ctx.reply('❌ Harga tidak valid:'); return true; }
            db.savePending(`adm_${ctx.from.id}`, { ...pending, step: 'deskripsi', harga });
            await ctx.reply('Deskripsi produk:');
            return true;
        }
        if (pending.step === 'deskripsi') {
            db.savePending(`adm_${ctx.from.id}`, { ...pending, step: 'snk', deskripsi: text });
            await ctx.reply('Syarat & Ketentuan (S&K)? Ketik "-" jika tidak ada:');
            return true;
        }
        if (pending.step === 'snk') {
            const products = getProducts();
            const maxId = products.length > 0 ? Math.max(...products.map(p => p.id)) : 0;
            const newP = {
                id: maxId + 1, nama: pending.nama, harga: pending.harga,
                kategori: 'Lainnya', deskripsi: pending.deskripsi,
                cara_penggunaan: 'Detail akun dikirim otomatis setelah pembelian.',
                snk: text === '-' ? '' : text
            };
            products.push(newP);
            saveProducts(products);
            db.deletePending(`adm_${ctx.from.id}`);
            await ctx.replyWithMarkdown(
                `✅ *Produk ditambahkan!*\n\n🆔 ID: ${newP.id}\n🏷️ ${newP.nama}\n💵 ${formatHarga(newP.harga)}\n\n_Sekarang tambahkan stok akun!_`,
                Markup.inlineKeyboard([[Markup.button.callback('🔑  Tambah Stok Akun', 'adm_stok')]])
            );
            return true;
        }
    }

    if (pending.type === 'add_saldo') {
        if (pending.step === 'user_id') {
            const targetId = text.trim();
            const targetUser = db.getUser(targetId);
            if (!targetUser) { await ctx.reply('❌ User tidak ditemukan. Masukkan User ID:'); return true; }
            db.savePending(`adm_${ctx.from.id}`, { ...pending, step: 'amount', targetId, targetName: targetUser.nama });
            await ctx.reply(`✅ User ditemukan: ${targetUser.nama}\nMasukkan nominal saldo:`);
            return true;
        }
        if (pending.step === 'amount') {
            const amount = parseInt(text);
            if (isNaN(amount) || amount <= 0) { await ctx.reply('❌ Nominal tidak valid:'); return true; }
            const saldoBaru = db.tambahSaldo(pending.targetId, amount);
            db.deletePending(`adm_${ctx.from.id}`);
            await ctx.replyWithMarkdown(`✅ *Saldo ditambahkan!*\n\n👤 ${pending.targetName}\n💵 +${formatHarga(amount)}\n💰 Saldo baru: ${formatHarga(saldoBaru)}`);
            try {
                await ctx.telegram.sendMessage(pending.targetId,
                    `💰 *Saldo kamu ditambah admin!*\n\n💵 +${formatHarga(amount)}\n💰 Saldo: ${formatHarga(saldoBaru)}`,
                    { parse_mode: 'Markdown' }
                );
            } catch (e) { }
            return true;
        }
    }

    if (pending.type === 'broadcast') {
        const users = db.getAllUsers();
        let sukses = 0, gagal = 0;
        db.deletePending(`adm_${ctx.from.id}`);
        for (const user of users) {
            try {
                await ctx.telegram.sendMessage(user.id, `📢 *Pesan dari ${STORE_NAME}:*\n\n${text}`, { parse_mode: 'Markdown' });
                sukses++;
            } catch (e) { gagal++; }
            await new Promise(r => setTimeout(r, 60));
        }
        await ctx.replyWithMarkdown(`📢 *Broadcast selesai!*\n\n✅ Terkirim: ${sukses}\n❌ Gagal: ${gagal}`);
        return true;
    }

    return false;
}

// ── DATA ORDER (paginasi) ─────────────────────────────
async function showAdminOrder(ctx, page = 0) {
    if (!isAdmin(ctx.from.id)) return;
    const allOrders = db.getAllOrders(9999);
    const totalPages = Math.max(1, Math.ceil(allOrders.length / ORDER_PAGE_SIZE));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const orders = allOrders.slice(safePage * ORDER_PAGE_SIZE, (safePage + 1) * ORDER_PAGE_SIZE);

    let text = `🛒 *DATA ORDER*\nHalaman ${safePage + 1}/${totalPages} | Total: ${allOrders.length}\n${'─'.repeat(28)}\n\n`;
    if (orders.length === 0) text += '_Belum ada order._';
    else orders.forEach(o => {
        text += `${statusEmoji(o.status)} \`${o.orderId}\`\n`;
        text += `   👤 ${o.userId}\n`;
        text += `   🏷️ ${o.productName} | 💵 ${formatHarga(o.harga)}\n\n`;
    });

    const navRow = [];
    if (safePage > 0) navRow.push(Markup.button.callback('◀️  Sebelumnya', `adm_order_page_${safePage - 1}`));
    if (safePage < totalPages - 1) navRow.push(Markup.button.callback('Selanjutnya  ▶️', `adm_order_page_${safePage + 1}`));
    const rows = [];
    if (navRow.length > 0) rows.push(navRow);
    rows.push([Markup.button.callback('◀️  Panel Admin', 'adm_panel')]);
    try { await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) }); }
    catch (e) { await ctx.replyWithMarkdown(text, Markup.inlineKeyboard(rows)); }
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});
}

// ── DATA USER (paginasi) ──────────────────────────────
async function showAdminUser(ctx, page = 0) {
    if (!isAdmin(ctx.from.id)) return;
    const allUsers = db.getAllUsers().sort((a, b) => (b.totalOrder || 0) - (a.totalOrder || 0));
    const totalPages = Math.max(1, Math.ceil(allUsers.length / USER_PAGE_SIZE));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const users = allUsers.slice(safePage * USER_PAGE_SIZE, (safePage + 1) * USER_PAGE_SIZE);

    let text = `👥 *DATA USER*\nHalaman ${safePage + 1}/${totalPages} | Total: ${allUsers.length}\n${'─'.repeat(28)}\n\n`;
    if (allUsers.length === 0) text += '_Belum ada user._';
    else users.forEach((u, i) => {
        const no = safePage * USER_PAGE_SIZE + i + 1;
        text += `*${no}.* ${u.nama} \`${u.id}\`\n`;
        text += `   💰 ${formatHarga(u.saldo)} | 🛒 ${u.totalOrder || 0}x\n\n`;
    });

    const navRow = [];
    if (safePage > 0) navRow.push(Markup.button.callback('◀️  Sebelumnya', `adm_user_page_${safePage - 1}`));
    if (safePage < totalPages - 1) navRow.push(Markup.button.callback('Selanjutnya  ▶️', `adm_user_page_${safePage + 1}`));
    const rows = [];
    if (navRow.length > 0) rows.push(navRow);
    rows.push([Markup.button.callback('◀️  Panel Admin', 'adm_panel')]);
    try { await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) }); }
    catch (e) { await ctx.replyWithMarkdown(text, Markup.inlineKeyboard(rows)); }
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});
}

// ── TAMBAH SALDO ───────────────────────────────────────
async function startTambahSaldo(ctx) {
    if (!isAdmin(ctx.from.id)) return;
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});
    db.savePending(`adm_${ctx.from.id}`, { type: 'add_saldo', step: 'user_id' });
    try {
        await ctx.editMessageText(`💰 *TAMBAH SALDO MANUAL*\n\nMasukkan User ID Telegram target:`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('❌  Batal', 'adm_panel')]])
        });
    } catch (e) { await ctx.replyWithMarkdown(`💰 *TAMBAH SALDO MANUAL*\n\nMasukkan User ID Telegram target:`); }
}

// ── BROADCAST ──────────────────────────────────────────
async function startBroadcast(ctx) {
    if (!isAdmin(ctx.from.id)) return;
    if (ctx.callbackQuery) ctx.answerCbQuery().catch(() => {});
    db.savePending(`adm_${ctx.from.id}`, { type: 'broadcast' });
    try {
        await ctx.editMessageText(`📢 *BROADCAST*\n\nKetik pesan yang akan dikirim ke semua user:`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('❌  Batal', 'adm_panel')]])
        });
    } catch (e) { await ctx.replyWithMarkdown(`📢 *BROADCAST*\n\nKetik pesan:`); }
}

// ── KIRIM DETAIL KE USER ───────────────────────────────
async function kirimDetail(ctx) {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 4) return ctx.reply('Format: /kirim [userId] [orderId] [detail]');
    const targetId = args[1], orderId = args[2], detail = args.slice(3).join(' ');
    try {
        await ctx.telegram.sendMessage(targetId,
            `✅ *Detail Order*\n\n🆔 \`${orderId}\`\n\n📦 *Akun:*\n\`\`\`\n${detail}\n\`\`\``,
            { parse_mode: 'Markdown' }
        );
        db.updateOrder(orderId, { detail, status: 'completed', completedAt: new Date().toISOString() });
        await ctx.reply(`✅ Terkirim ke ${targetId}`);
    } catch (e) { await ctx.reply(`❌ Gagal: ${e.message}`); }
}

module.exports = {
    isAdmin, showAdminPanel, showAdminProduk,
    showEditMenu, startEditField, confirmHapusProduk, hapusProduk,
    showAdminStok, startTambahAkun, startTambahProduk, handleAdminInput,
    showAdminOrder, showAdminUser, startTambahSaldo, startBroadcast, kirimDetail
};
