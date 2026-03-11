const { Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const db = require('../lib/db');

const PRODUCTS_PATH = path.join(__dirname, '..', 'products.json');

function getProducts() {
    try { return JSON.parse(fs.readFileSync(PRODUCTS_PATH, 'utf-8')); }
    catch (e) { return []; }
}

function saveProducts(products) {
    fs.writeFileSync(PRODUCTS_PATH, JSON.stringify(products, null, 2));
}

function formatHarga(harga) {
    return `Rp ${Number(harga).toLocaleString('id-ID')}`;
}

// ── Helper edit/hapus+kirim ─────────────────────────────
async function editOrReply(ctx, text, keyboard) {
    try {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    } catch (e) {
        try { await ctx.deleteMessage(); } catch (_) { }
        await ctx.replyWithMarkdown(text, keyboard);
    }
}

// ── ICON KATEGORI ───────────────────────────────────────
const KATEGORI_ICON = {
    'Streaming': '📺',
    'Musik': '🎵',
    'Desain': '🎨',
    'Edit Video': '🎬',
    'AI': '🤖',
    'Produktivitas': '📊',
    'VPN': '🔒',
    'Lainnya': '📦',
};

function getKatIcon(kat) {
    return KATEGORI_ICON[kat] || '📦';
}

// ── Grouping: { 'Streaming': [p1,p3,p4], ... } ─────────
function groupByKategori(products) {
    const groups = {};
    for (const p of products) {
        const kat = p.kategori || 'Lainnya';
        if (!groups[kat]) groups[kat] = [];
        groups[kat].push(p);
    }
    return groups;
}

// Helper untuk dapat ordered kategori array
function getOrderedCategories(products) {
    const withStock = products.map(p => ({ ...p, stok: db.getStock(p.id) }));
    const groups = groupByKategori(withStock);
    const ordered = [];
    for (const [kat, items] of Object.entries(groups)) {
        ordered.push({ name: kat, items });
    }
    return ordered;
}

// ── LIST SEMUA KATEGORI (Step 1) ────────────────────────
async function showProductList(ctx) {
    const products = getProducts();
    if (products.length === 0) {
        return ctx.answerCbQuery('❌ Belum ada produk', { show_alert: true });
    }

    const categories = getOrderedCategories(products);

    let text = `🛍️ *SEMUA KATEGORI PRODUK*\n${'─'.repeat(28)}\n\n`;

    const rows = [];
    let currentRow = [];

    categories.forEach((cat, index) => {
        const num = index + 1;
        const icon = getKatIcon(cat.name);
        text += `*${num}.* ${icon} *${cat.name}*\n`;
        cat.items.forEach(p => {
            const stokIcon = p.stok > 0 ? '✅' : '🔴';
            const stokText = p.stok > 0 ? `${p.stok} slot` : 'Habis';
            text += `  • ${p.nama} — ${formatHarga(p.harga)} | ${stokIcon} ${stokText}\n`;
        });
        text += '\n';

        currentRow.push(Markup.button.callback(`${num}`, `kat_${index}`));
        if (currentRow.length === 4) {
            rows.push(currentRow);
            currentRow = [];
        }
    });

    if (currentRow.length > 0) rows.push(currentRow);

    text += `_Pilih nomor kategori:_\n`;

    rows.push([
        Markup.button.callback('📦  Stok Tersedia', 'menu_stok_ready'),
        Markup.button.callback('🏆  Leaderboard', 'menu_leaderboard')
    ]);
    rows.push([Markup.button.callback('🏠  Menu Utama', 'menu_utama')]);

    await editOrReply(ctx, text, Markup.inlineKeyboard(rows));
    ctx.answerCbQuery?.();
}

// ── DETAIL KATEGORI (Step 2) ────────────────────────────
async function showCategoryDetail(ctx, catIndex) {
    const products = getProducts();
    const categories = getOrderedCategories(products);
    const cat = categories[parseInt(catIndex)];

    if (!cat) return ctx.answerCbQuery('❌ Kategori tidak ditemukan', { show_alert: true });

    const icon = getKatIcon(cat.name);
    let text = `${icon} *Kategori: ${cat.name}*\n${'─'.repeat(28)}\n\n`;

    const rows = [];
    let currentRow = [];

    cat.items.forEach((p, index) => {
        const num = index + 1;
        const stokIcon = p.stok > 0 ? '✅' : '🔴';
        const stokText = p.stok > 0 ? `${p.stok} slot` : 'Habis';
        text += `*${num}.* ${p.nama} — ${formatHarga(p.harga)} | ${stokIcon} ${stokText}\n`;

        currentRow.push(Markup.button.callback(`${num}`, `produk_${p.id}`));
        if (currentRow.length === 4) {
            rows.push(currentRow);
            currentRow = [];
        }
    });

    if (currentRow.length > 0) rows.push(currentRow);

    text += `\n_Pilih nomor produk:_\n`;

    rows.push([Markup.button.callback('◀️  Kembali ke Kategori', 'menu_produk')]);
    rows.push([Markup.button.callback('🏠  Menu Utama', 'menu_utama')]);

    await editOrReply(ctx, text, Markup.inlineKeyboard(rows));
    ctx.answerCbQuery?.();
}

// ── STOK TERSEDIA — hanya produk ready ─────────────────
async function showProductsByStock(ctx) {
    const products = getProducts();
    const withStock = products.map(p => ({ ...p, stok: db.getStock(p.id) }));
    const ready = withStock.filter(p => p.stok > 0);

    if (ready.length === 0) {
        await editOrReply(ctx,
            `📦 *STOK TERSEDIA*\n${'─'.repeat(28)}\n\n🔴 _Semua produk sedang habis stok._\n\nHubungi admin untuk info ketersediaan.`,
            Markup.inlineKeyboard([
                [Markup.button.callback('🛍️  Semua Produk', 'menu_produk')],
                [Markup.button.callback('🏠  Menu Utama', 'menu_utama')]
            ])
        );
        ctx.answerCbQuery?.();
        return;
    }

    const groups = groupByKategori(ready);

    let text = `📦 *STOK TERSEDIA* (${ready.length} produk)\n${'─'.repeat(28)}\n\n`;
    const rows = [];

    // Kita buat list number untuk produk yang ready stock
    // Berbeda dengan kategori, mari kita list sequential saja
    let productIndex = 1;
    let currentRow = [];

    for (const [kat, items] of Object.entries(groups)) {
        const icon = getKatIcon(kat);
        text += `${icon} *${kat}*\n`;
        items.forEach(p => {
            text += `*${productIndex}.* ${p.nama} — ${formatHarga(p.harga)} | ✅ ${p.stok} slot\n`;

            currentRow.push(Markup.button.callback(`${productIndex}`, `produk_${p.id}`));
            if (currentRow.length === 4) {
                rows.push(currentRow);
                currentRow = [];
            }
            productIndex++;
        });
        text += '\n';
    }

    if (currentRow.length > 0) rows.push(currentRow);
    text += `\n_Pilih nomor produk:_\n`;

    rows.push([
        Markup.button.callback('🛍️  Semua Produk', 'menu_produk'),
        Markup.button.callback('🏠  Menu Utama', 'menu_utama')
    ]);

    await editOrReply(ctx, text, Markup.inlineKeyboard(rows));
    ctx.answerCbQuery?.();
}

// ── DETAIL PRODUK ──────────────────────────────────────
async function showProductDetail(ctx, productId) {
    const products = getProducts();
    const p = products.find(x => x.id === parseInt(productId));
    if (!p) return ctx.answerCbQuery('❌ Produk tidak ditemukan', { show_alert: true });

    const stok = db.getStock(p.id);
    const stokText = stok > 0 ? `✅ ${stok} slot tersedia` : '🔴 Stok Habis';
    const icon = getKatIcon(p.kategori);

    let text = `${icon} *${p.nama}*\n${'─'.repeat(28)}\n\n`;
    text += `💵 *Harga:* ${formatHarga(p.harga)}\n`;
    text += `📊 *Stok:* ${stokText}\n`;
    text += `🗂️ *Kategori:* ${p.kategori || '-'}\n\n`;
    text += `📝 *Deskripsi:*\n${p.deskripsi || '-'}\n\n`;
    text += `📌 *Cara Penggunaan:*\n${p.cara_penggunaan || '-'}`;

    const keyboard = [];
    if (stok > 0) {
        keyboard.push([
            Markup.button.callback('💳  Beli dengan Saldo', `beli_saldo_${p.id}`),
            Markup.button.callback('📱  Beli via QRIS', `beli_qris_${p.id}`)
        ]);
    } else {
        keyboard.push([Markup.button.callback('🔴  Stok Habis', 'stok_habis')]);
    } // Hapus fallback empty
    if (p.snk) {
        keyboard.push([Markup.button.callback('📋  Syarat & Ketentuan', `snk_${p.id}`)]);
    }
    keyboard.push([
        Markup.button.callback('◀️  Kembali', 'menu_produk'),
        Markup.button.callback('🏠  Menu Utama', 'menu_utama')
    ]);

    await editOrReply(ctx, text, Markup.inlineKeyboard(keyboard));
    ctx.answerCbQuery?.();
}

// ── S&K ─────────────────────────────────────────────────
async function showSnk(ctx, productId) {
    const products = getProducts();
    const p = products.find(x => x.id === parseInt(productId));
    if (!p) return ctx.answerCbQuery('❌ Produk tidak ditemukan', { show_alert: true });

    const text =
        `📋 *Syarat & Ketentuan*\n` +
        `🏷️ ${p.nama}\n${'─'.repeat(28)}\n\n` +
        `${p.snk || '_Belum ada S&K untuk produk ini._'}`;

    await editOrReply(ctx, text, Markup.inlineKeyboard([
        [Markup.button.callback('◀️  Kembali ke Detail', `produk_${p.id}`)],
        [Markup.button.callback('🏠  Menu Utama', 'menu_utama')]
    ]));
    ctx.answerCbQuery?.();
}

// ── STATUS STOCK (admin-style detail) ──────────────────
async function showStock(ctx) {
    const products = getProducts();
    let text = `📦 *STATUS STOK SEMUA PRODUK*\n${'─'.repeat(28)}\n\n`;

    if (products.length === 0) {
        text += '_Belum ada produk._';
    } else {
        const groups = groupByKategori(products.map(p => ({ ...p, stok: db.getStock(p.id) })));
        for (const [kat, items] of Object.entries(groups)) {
            text += `${getKatIcon(kat)} *${kat}*\n`;
            items.forEach(p => {
                const icon = p.stok > 0 ? '✅' : '🔴';
                text += `  ${icon} ${p.nama} — ${p.stok > 0 ? `${p.stok} slot` : 'Habis'}\n`;
            });
            text += '\n';
        }
    }

    await editOrReply(ctx, text, Markup.inlineKeyboard([
        [Markup.button.callback('🛍️  Semua Produk', 'menu_produk')],
        [Markup.button.callback('🏠  Menu Utama', 'menu_utama')]
    ]));
    ctx.answerCbQuery?.();
}

module.exports = {
    showProductList, showCategoryDetail, showProductsByStock, showProductDetail,
    showSnk, showStock, getProducts, saveProducts, formatHarga
};
