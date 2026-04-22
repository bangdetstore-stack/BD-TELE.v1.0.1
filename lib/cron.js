const cron = require('node-cron');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');
const db = require('./db');

// Root folder as reference
const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const BACKUP_DIR = path.join(ROOT_DIR, 'backups');

function startCronJobs(botTelegram) {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR);
    }

    // ── 1. Backup Database Setiap 6 Jam ─────────────────────
    cron.schedule('0 */12 * * *', async () => {
        try {
            const timeStr = new Date().toISOString().replace(/[:.]/g, '-');
            const zipFileName = `backup_${timeStr}.zip`;
            const zipFilePath = path.join(BACKUP_DIR, zipFileName);
            
            const zip = new JSZip();

            // Add products.json
            const productsPath = path.join(ROOT_DIR, 'products.json');
            if (fs.existsSync(productsPath)) {
                zip.file('products.json', fs.readFileSync(productsPath));
            }

            // Add data folder
            const dataFolder = zip.folder('data');
            if (fs.existsSync(DATA_DIR)) {
                const files = fs.readdirSync(DATA_DIR);
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        dataFolder.file(file, fs.readFileSync(path.join(DATA_DIR, file)));
                    }
                }
            }
            
            // Generate zip file
            const content = await zip.generateAsync({ type: 'nodebuffer' });
            fs.writeFileSync(zipFilePath, content);
            console.log(`[CRON] ✅ Backup database (ZIP) berhasil dibuat di: ${zipFilePath}`);

            // Send to Admin
            const adminId = process.env.ADMIN_ID;
            if (adminId) {
                try {
                    await botTelegram.sendDocument(adminId, { source: zipFilePath }, { caption: `📦 *AUTO-BACKUP DATABASE*\n\nWaktu: ${new Date().toLocaleString('id-ID')}\n_Backup otomatis setiap 12 jam._`, parse_mode: 'Markdown' });
                } catch (e) {
                    console.error('[CRON] ❌ Gagal mengirim backup ke Admin:', e.message);
                }
            }
        } catch (e) {
            console.error(`[CRON] ❌ Gagal membuat backup database:`, e.message);
        }
    });

    // ── 2. Auto-Cancel Expired Orders Setiap Menit ──────────
    // '*/1 * * * *' = Setiap menit
    cron.schedule('*/1 * * * *', async () => {
        try {
            const pendingList = db.getAllPending();
            const now = new Date();

            let cancelledCount = 0;

            for (const key of Object.keys(pendingList)) {
                const pending = pendingList[key];

                // Cek apakah punya expiredAt dan apakah sudah lewat (expired)
                if (pending.expiredAt) {
                    const expiredTime = new Date(pending.expiredAt);
                    if (now > expiredTime) {
                        db.deletePending(key);
                        cancelledCount++;

                        // Notifikasi ke user opsional
                        if (pending.type === 'order') {
                            db.restoreAccount(pending.orderId); // Kembalikan stok
                            try {
                                await botTelegram.sendMessage(
                                    pending.userId,
                                    `❌ *Pembayaran Dibatalkan Otomatis*\n\nOrder \`${pending.orderId}\` telah melewati batas waktu pembayaran.`,
                                    { parse_mode: 'Markdown' }
                                );
                            } catch (err) { }
                        } else if (pending.type === 'deposit') {
                            try {
                                await botTelegram.sendMessage(
                                    pending.userId,
                                    `❌ *Deposit Dibatalkan Otomatis*\n\nDeposit \`${pending.orderId}\` telah melewati batas waktu pembayaran.`,
                                    { parse_mode: 'Markdown' }
                                );
                            } catch (err) { }
                        }
                    }
                }
            }

            if (cancelledCount > 0) {
                console.log(`[CRON] 🗑️ Membersihkan ${cancelledCount} transaksi expired.`);
            }
        } catch (e) {
            console.error(`[CRON] ❌ Error saat auto-cancel expired orders:`, e.message);
        }
    });

    console.log('⏳ Background Cron Jobs berjalan (Auto Backup & Auto Cancel)');
}

module.exports = { startCronJobs };
