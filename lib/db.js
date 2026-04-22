const fs = require('fs');
const path = require('path');

// ── Folder dan path file database ──────────────────────
const DATA_DIR = path.join(__dirname, '..', 'data');

const FILES = {
    users: path.join(DATA_DIR, 'users.json'),
    accounts: path.join(DATA_DIR, 'accounts.json'),
    orders: path.join(DATA_DIR, 'orders.json'),
    deposits: path.join(DATA_DIR, 'deposits.json'),
    pending: path.join(DATA_DIR, 'pending.json')
};

const DEFAULTS = {
    users: {},
    accounts: [],
    orders: [],
    deposits: [],
    pending: {}
};

// ── Buat folder data/ jika belum ada ───────────────────
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ── Migrasi dari database.json lama (jika ada) ─────────
const OLD_DB = path.join(__dirname, '..', 'database.json');
if (fs.existsSync(OLD_DB)) {
    try {
        const old = JSON.parse(fs.readFileSync(OLD_DB, 'utf-8'));
        if (old.users && !fs.existsSync(FILES.users)) fs.writeFileSync(FILES.users, JSON.stringify(old.users || {}, null, 2));
        if (old.accounts && !fs.existsSync(FILES.accounts)) fs.writeFileSync(FILES.accounts, JSON.stringify(old.accounts || [], null, 2));
        if (old.orders && !fs.existsSync(FILES.orders)) fs.writeFileSync(FILES.orders, JSON.stringify(old.orders || [], null, 2));
        if (old.deposits && !fs.existsSync(FILES.deposits)) fs.writeFileSync(FILES.deposits, JSON.stringify(old.deposits || [], null, 2));
        if (old.pendingPayments && !fs.existsSync(FILES.pending)) fs.writeFileSync(FILES.pending, JSON.stringify(old.pendingPayments || {}, null, 2));
        // Rename database.json lama agar tidak dibaca ulang
        fs.renameSync(OLD_DB, OLD_DB + '.migrated');
        console.log('✅ Migrasi dari database.json selesai → data/');
    } catch (e) {
        console.error('⚠️ Gagal migrasi database lama:', e.message);
    }
}

// ── Generic read/write per file ────────────────────────
function read(key) {
    const file = FILES[key];
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(DEFAULTS[key], null, 2));
        return JSON.parse(JSON.stringify(DEFAULTS[key]));
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
        return JSON.parse(JSON.stringify(DEFAULTS[key]));
    }
}

function write(key, data) {
    const tempFile = FILES[key] + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
    fs.renameSync(tempFile, FILES[key]);
}

// ════════════════════════════════════════════════════════
//  USERS  (data/users.json)
// ════════════════════════════════════════════════════════

function getUser(userId) {
    const users = read('users');
    return users[String(userId)] || null;
}

function registerUser(userId, userData) {
    const users = read('users');
    const id = String(userId);
    if (!users[id]) {
        users[id] = {
            id: userId,
            nama: userData.nama || 'User',
            username: userData.username || '',
            saldo: 0,
            totalOrder: 0,
            totalSpend: 0,
            bergabung: new Date().toISOString(),
            ...userData
        };
        write('users', users);
    }
    return users[id];
}

function updateUser(userId, updates) {
    const users = read('users');
    const id = String(userId);
    if (!users[id]) return null;
    users[id] = { ...users[id], ...updates };
    write('users', users);
    return users[id];
}

function getAllUsers() {
    return Object.values(read('users'));
}

function getStats() {
    const users = getAllUsers();
    const orders = read('orders');
    return {
        totalUser: users.length,
        totalTransaksi: orders.filter(o => o.status === 'completed').length
    };
}

function getLeaderboard(limit = 10) {
    return getAllUsers()
        .filter(u => (u.totalOrder || 0) > 0)
        .sort((a, b) => (b.totalOrder || 0) - (a.totalOrder || 0))
        .slice(0, limit);
}

// ── Saldo ──────────────────────────────────────────────
function getSaldo(userId) {
    const user = getUser(userId);
    return user ? user.saldo : 0;
}

function tambahSaldo(userId, amount) {
    const users = read('users');
    const id = String(userId);
    if (!users[id]) return false;
    users[id].saldo += amount;
    write('users', users);
    return users[id].saldo;
}

function kurangiSaldo(userId, amount) {
    const users = read('users');
    const id = String(userId);
    if (!users[id] || users[id].saldo < amount) return false;
    users[id].saldo -= amount;
    write('users', users);
    return users[id].saldo;
}

// ════════════════════════════════════════════════════════
//  ACCOUNTS / STOK  (data/accounts.json)
// ════════════════════════════════════════════════════════

/**
 * Tambah satu atau beberapa akun ke stok produk
 * details: string | string[]
 */
function addAccounts(productId, details) {
    const accounts = read('accounts');
    const arr = Array.isArray(details) ? details : [details];
    let added = 0;
    for (const detail of arr) {
        if (!detail || !detail.trim()) continue;
        accounts.push({
            id: `ACC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
            productId: String(productId),
            detail: detail.trim(),
            status: 'available',    // 'available' | 'sold'
            orderId: null,
            soldAt: null
        });
        added++;
    }
    write('accounts', accounts);
    return added;
}

/** Jumlah slot available untuk produk tertentu */
function getStock(productId) {
    return read('accounts').filter(
        a => a.productId === String(productId) && a.status === 'available'
    ).length;
}

/** Ambil & mark sold satu akun available */
function takeAccount(productId, orderId) {
    const accounts = read('accounts');
    const idx = accounts.findIndex(
        a => a.productId === String(productId) && a.status === 'available'
    );
    if (idx === -1) return null;
    accounts[idx].status = 'sold';
    accounts[idx].orderId = orderId;
    accounts[idx].soldAt = new Date().toISOString();
    write('accounts', accounts);
    return accounts[idx].detail;
}

/** Kembalikan akun ke stok (jika order dibatalkan) */
function restoreAccount(orderId) {
    const accounts = read('accounts');
    const idx = accounts.findIndex(a => a.orderId === orderId && a.status === 'sold');
    if (idx === -1) return false;
    accounts[idx].status = 'available';
    accounts[idx].orderId = null;
    accounts[idx].soldAt = null;
    write('accounts', accounts);
    return true;
}

/** Dapatkan akun berdasarkan orderId (tanpa reserve) */
function getAccountDetailByOrderId(orderId) {
    const account = read('accounts').find(a => a.orderId === orderId && a.status === 'sold');
    return account ? account.detail : null;
}

/** Lihat semua akun untuk produk (untuk admin) */
function getAccountsByProduct(productId) {
    return read('accounts').filter(a => a.productId === String(productId));
}

/** Hapus semua akun available untuk produk (saat produk dihapus) */
function clearAccounts(productId) {
    const accounts = read('accounts').filter(
        a => !(a.productId === String(productId) && a.status === 'available')
    );
    write('accounts', accounts);
}

// ════════════════════════════════════════════════════════
//  ORDERS  (data/orders.json)
// ════════════════════════════════════════════════════════

function createOrder(orderData) {
    const orders = read('orders');
    const order = {
        orderId: orderData.orderId,
        userId: orderData.userId,
        productId: orderData.productId,
        productName: orderData.productName,
        harga: orderData.harga,
        paymentMethod: orderData.paymentMethod,
        status: orderData.status || 'pending',
        detail: orderData.detail || null,
        createdAt: new Date().toISOString(),
        completedAt: null
    };
    orders.push(order);
    write('orders', orders);
    return order;
}

function updateOrder(orderId, updates) {
    const orders = read('orders');
    const idx = orders.findIndex(o => o.orderId === orderId);
    if (idx === -1) return null;
    orders[idx] = { ...orders[idx], ...updates };
    write('orders', orders);
    return orders[idx];
}

function getOrderById(orderId) {
    return read('orders').find(o => o.orderId === orderId) || null;
}

function getOrdersByUser(userId, limit = 10) {
    return read('orders')
        .filter(o => String(o.userId) === String(userId))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);
}

function getAllOrders(limit = 50) {
    return read('orders')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);
}

// ════════════════════════════════════════════════════════
//  DEPOSITS  (data/deposits.json)
// ════════════════════════════════════════════════════════

function createDeposit(depositData) {
    const deposits = read('deposits');
    const deposit = {
        orderId: depositData.orderId,
        userId: depositData.userId,
        amount: depositData.amount,
        totalPayment: depositData.totalPayment,
        paymentMethod: depositData.paymentMethod,
        status: 'pending',
        createdAt: new Date().toISOString(),
        completedAt: null
    };
    deposits.push(deposit);
    write('deposits', deposits);
    return deposit;
}

function updateDeposit(orderId, updates) {
    const deposits = read('deposits');
    const idx = deposits.findIndex(d => d.orderId === orderId);
    if (idx === -1) return null;
    deposits[idx] = { ...deposits[idx], ...updates };
    write('deposits', deposits);
    return deposits[idx];
}

function getDepositById(orderId) {
    return read('deposits').find(d => d.orderId === orderId) || null;
}

function getDepositsByUser(userId, limit = 10) {
    return read('deposits')
        .filter(d => String(d.userId) === String(userId))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);
}

// ════════════════════════════════════════════════════════
//  PENDING PAYMENTS  (data/pending.json)
// ════════════════════════════════════════════════════════

function savePending(key, data) {
    const pending = read('pending');
    pending[key] = { ...data, savedAt: new Date().toISOString() };
    write('pending', pending);
}

function getPending(key) {
    return read('pending')[key] || null;
}

function getAllPending() {
    return read('pending');
}

function deletePending(key) {
    const pending = read('pending');
    delete pending[key];
    write('pending', pending);
}

function hasPendingTransaction(userId) {
    const allPending = read('pending');
    for (const key in allPending) {
        if (String(allPending[key].userId) === String(userId)) {
            return true;
        }
    }
    return false;
}

// ════════════════════════════════════════════════════════
//  EXPORTS
// ════════════════════════════════════════════════════════
module.exports = {
    // Users
    getUser, registerUser, updateUser, getAllUsers,
    getStats, getLeaderboard,
    getSaldo, tambahSaldo, kurangiSaldo,
    // Accounts/Stok
    addAccounts, getStock, takeAccount, restoreAccount, getAccountDetailByOrderId, getAccountsByProduct, clearAccounts,
    // Orders
    createOrder, updateOrder, getOrderById, getOrdersByUser, getAllOrders,
    // Deposits
    createDeposit, updateDeposit, getDepositById, getDepositsByUser,
    // Pending
    savePending, getPending, deletePending, getAllPending, hasPendingTransaction
};
