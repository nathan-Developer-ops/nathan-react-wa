import admin from 'firebase-admin';

function getFirebaseAdmin() {
    if (!admin.apps.length) {
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON belum diatur.');
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(raw))
        });
    }
    return admin;
}

async function verifyUser(req) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) throw new Error('AUTH_REQUIRED');
    const token = authHeader.slice(7);
    return getFirebaseAdmin().auth().verifyIdToken(token);
}

function verifyAdmin(req) {
    const configuredPassword = process.env.ADMIN_PASSWORD;
    if (!configuredPassword) throw new Error('ADMIN_PASSWORD_NOT_CONFIGURED');
    const password = req.headers['x-admin-password'];
    if (!password || password !== configuredPassword) throw new Error('ADMIN_REQUIRED');
}

export default async function handler(req, res) {
    try {
        const firebaseAdmin = getFirebaseAdmin();
        const db = firebaseAdmin.firestore();
        const action = String(req.query.action || req.body?.action || '');

        if (action === 'admin-check') {
            verifyAdmin(req);
            return res.status(200).json({ ok: true });
        }

        if (action === 'balance' || action === 'redeem' || action === 'consume') {
            const user = await verifyUser(req);
            const userRef = db.collection('reactionUsers').doc(user.uid);

            if (action === 'balance') {
                const snap = await userRef.get();
                return res.status(200).json({ bonusTokens: snap.exists ? Number(snap.data().bonusTokens || 0) : 0 });
            }

            if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

            if (action === 'consume') {
                const result = await db.runTransaction(async tx => {
                    const snap = await tx.get(userRef);
                    const current = snap.exists ? Number(snap.data().bonusTokens || 0) : 0;
                    if (current <= 0) return { ok: false, bonusTokens: 0 };
                    tx.set(userRef, { bonusTokens: current - 1, updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp() }, { merge: true });
                    return { ok: true, bonusTokens: current - 1 };
                });
                if (!result.ok) return res.status(409).json({ message: 'Token bonus habis.' });
                return res.status(200).json(result);
            }

            const code = String(req.body?.code || '').trim().toUpperCase();
            if (!code) return res.status(400).json({ message: 'Kode redeem wajib diisi.' });
            const codeRef = db.collection('redeemCodes').doc(code);

            if (action === 'redeem') {
                const result = await db.runTransaction(async tx => {
                    const codeSnap = await tx.get(codeRef);
                    if (!codeSnap.exists) throw new Error('CODE_NOT_FOUND');
                    const item = codeSnap.data();
                    const now = Date.now();
                    if (Number(item.expiresAt) <= now) throw new Error('CODE_EXPIRED');
                    if (Number(item.used || 0) >= Number(item.maxUses || 0)) throw new Error('CODE_LIMIT');

                    const redemptionRef = codeRef.collection('redeemedUsers').doc(user.uid);
                    const redemptionSnap = await tx.get(redemptionRef);
                    if (redemptionSnap.exists) throw new Error('ALREADY_REDEEMED');

                    const userSnap = await tx.get(userRef);
                    const currentBonus = userSnap.exists ? Number(userSnap.data().bonusTokens || 0) : 0;
                    const added = Number(item.tokens || 0);
                    const newBonus = currentBonus + added;

                    tx.update(codeRef, { used: firebaseAdmin.firestore.FieldValue.increment(1), updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp() });
                    tx.set(redemptionRef, { redeemedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(), tokens: added });
                    tx.set(userRef, { bonusTokens: newBonus, updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp() }, { merge: true });

                    return { addedTokens: added, bonusTokens: newBonus };
                });
                return res.status(200).json(result);
            }
        }

        if (action === 'list') {
            verifyAdmin(req);
            const snap = await db.collection('redeemCodes').orderBy('createdAt', 'desc').limit(100).get();
            const codes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return res.status(200).json({ codes });
        }

        if (action === 'create' || action === 'delete') {
            if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
            verifyAdmin(req);

            if (action === 'delete') {
                const code = String(req.body?.code || '').trim().toUpperCase();
                if (!code) return res.status(400).json({ message: 'Kode wajib diisi.' });
                await db.collection('redeemCodes').doc(code).delete();
                return res.status(200).json({ ok: true });
            }

            const code = String(req.body?.code || '').trim().toUpperCase();
            const tokens = Math.floor(Number(req.body?.tokens));
            const maxUses = Math.floor(Number(req.body?.maxUses));
            const hours = Number(req.body?.hours);
            if (!/^[A-Z0-9_-]{3,32}$/.test(code) || tokens < 1 || maxUses < 1 || !Number.isFinite(hours) || hours <= 0) {
                return res.status(400).json({ message: 'Data kode tidak valid.' });
            }

            const ref = db.collection('redeemCodes').doc(code);
            if ((await ref.get()).exists) return res.status(409).json({ message: 'Kode tersebut sudah ada.' });
            const now = Date.now();
            const item = { code, tokens, maxUses, used: 0, expiresAt: now + hours * 60 * 60 * 1000, createdAt: now };
            await ref.set(item);
            return res.status(200).json(item);
        }

        return res.status(400).json({ message: 'Action tidak dikenal.' });
    } catch (error) {
        console.error('Redeem API error:', error);
        const messages = {
            AUTH_REQUIRED: ['Unauthorized', 401],
            ADMIN_REQUIRED: ['Password admin salah.', 403],
            ADMIN_PASSWORD_NOT_CONFIGURED: ['ADMIN_PASSWORD belum diatur di Vercel Environment Variables.', 500],
            CODE_NOT_FOUND: ['Kode redeem tidak ditemukan.', 404],
            CODE_EXPIRED: ['Kode redeem sudah expired.', 410],
            CODE_LIMIT: ['Batas penggunaan kode sudah habis.', 409],
            ALREADY_REDEEMED: ['Kode ini sudah pernah kamu redeem.', 409]
        };
        const [message, status] = messages[error.message] || [error.message || 'Server error.', 500];
        return res.status(status).json({ message });
    }
}
