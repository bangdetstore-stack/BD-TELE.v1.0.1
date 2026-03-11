const cron = require('node-cron');
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
    // Pola cron: '* * * * *' = Menit, Jam, Tgl, Bln, Hari
    // '0 */6 * * *' = Menit 0, setiap 6 jam
    cron.schedule('0 */6 * * *', () => {
        try {
            const timeStr = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFolder = path.join(BACKUP_DIR, `backup_${timeStr}`);
            fs.mkdirSync(backupFolder);

            // Copy products.json
            if (fs.existsSync(path.join(ROOT_DIR, 'products.json'))) {
                fs.copyFileSync(
                    path.join(ROOT_DIR, 'products.json'),
                    path.join(backupFolder, 'products.json')
                );
            }

            // Copy semua isi folder data/
            if (fs.existsSync(DATA_DIR)) {
                const files = fs.readdirSync(DATA_DIR);
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        fs.copyFileSync(
                            path.join(DATA_DIR, file),
                            path.join(backupFolder, file)
                        );
                    }
                }
            }
            console.log(`[CRON] ✅ Backup database berhasil dibuat di: ${backupFolder}`);
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
