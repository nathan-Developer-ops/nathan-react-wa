const API_URL = 'https://api.nexadev.my.id/api/rch';

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({
            status: 'error',
            message: 'Method Not Allowed'
        });
    }

    const { url, reaction } = req.query || {};
    const apiKey = process.env.REACTION_API_KEY;

    if (!apiKey) {
        return res.status(500).json({
            status: 'error',
            message: 'REACTION_API_KEY belum diset di Vercel.'
        });
    }

    if (!url || !reaction) {
        return res.status(400).json({
            status: 'error',
            message: 'Parameter url dan reaction wajib diisi.'
        });
    }

    try {
        const targetUrl = new URL(API_URL);
        targetUrl.searchParams.set('key', apiKey);
        targetUrl.searchParams.set('url', url);
        targetUrl.searchParams.set('reaction', reaction);

        const response = await fetch(targetUrl.toString(), {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/plain, */*'
            }
        });

        const rawText = await response.text();
        let data;

        try {
            data = JSON.parse(rawText);
        } catch {
            data = {
                message: rawText
            };
        }

        return res.status(response.status).json(data);
    } catch (error) {
        console.error('Reaction proxy error:', error);

        return res.status(502).json({
            status: 'error',
            message: 'Gagal menghubungi server reaction.'
        });
    }
};
