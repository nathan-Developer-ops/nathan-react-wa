# WhatsApp Channel Reaction - Vercel

## Struktur

- `index.html` - frontend
- `api/rch.js` - Vercel serverless proxy
- `vercel.json` - konfigurasi Vercel

## Environment Variable

Tambahkan di Vercel:

`REACTION_API_KEY`

Value:

`RS-yGx7Hy!C`

Jangan masukkan API key tersebut ke kode frontend.

## Deploy

Import folder/project ini ke Vercel.

Setelah project dibuat:
1. Buka Settings.
2. Environment Variables.
3. Tambahkan `REACTION_API_KEY`.
4. Isi value API key.
5. Redeploy.

Frontend memanggil `/api/rch`, lalu Function Vercel meneruskan request ke API reaction.
