export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({
            status: 'error',
            message: 'Method Not Allowed'
        });
    }

    const { url, reaction } = req.query;
    const apiKey = process.env.REACTION_API_KEY;

    if (!apiKey) {
        return res.status(500).json({
            status: 'error',
            message: 'REACTION_API_KEY belum diatur di Vercel Environment Variables.'
        });
    }

    if (!url || !reaction) {
        return res.status(400).json({
            status: 'error',
            message: 'Parameter url dan reaction wajib diisi.'
        });
    }

    let channelUrl;

    try {
        channelUrl = new URL(url);
    } catch {
        return res.status(400).json({
            status: 'error',
            message: 'URL channel tidak valid.'
        });
    }

    if (channelUrl.protocol !== 'https:' || channelUrl.hostname !== 'whatsapp.com') {
        return res.status(400).json({
            status: 'error',
            message: 'Hanya link WhatsApp Channel yang diperbolehkan.'
        });
    }

    const targetUrl =
        'https://api.nexadev.my.id/api/rch' +
        '?key=' + encodeURIComponent(apiKey) +
        '&url=' + encodeURIComponent(url) +
        '&reaction=' + encodeURIComponent(reaction);

    try {
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                Accept: 'application/json, text/plain, */*'
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
        console.error('Reaction API error:', error);

        return res.status(502).json({
            status: 'error',
            message: 'Server reaction sedang tidak dapat dihubungi.'
        });
    }
}
