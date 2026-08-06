# 🎵 Discord Spotify Lyric Status Engine

A real-time Web & Node.js application that synchronizes your currently playing Spotify lyrics into your Discord Custom Status automatically, built with smart timing balance, status rules (Online/Idle/DND vs Invisible), and rate-limiting protection.

Built by **Ahmad Fajar Alfaravi**

---

## 🌟 Features

- **⚡ Real-time Lyric Sync**: Fetch synchronized LRC lyrics automatically from [LRCLIB](https://lrclib.net/).
- **🌐 Universal Web Platform**: Live Web Dashboard for Vercel deployment with real-time Console Logger.
- **🛡️ Status Rules**:
  - 🟢 **Online**, 🌙 **Idle**, ⛔ **Do Not Disturb (DND)**: Lyric status updates active.
  - ⚪ **Invisible / Offline**: Status updates automatically PAUSED to keep you hidden.
- **⚖️ Smart Balance Engine**:
  - **Rate Limit Balancer**: Prevents Discord API rate-limiting by throttling status updates and updating status only on lyric changes.
  - **Latency & Offset Adjuster**: Easily adjust lyric delay (`LYRIC_OFFSET_MS`) to match your exact audio sync.
- **🔄 Auto Reconnect**: Real-time Browser Native Discord Gateway WebSocket Engine.

---

## ⚠️ Important Warning (Self-Bot Notice)

> **Automating custom status updates using a user token technically violates Discord's Terms of Service.**
> This project uses rate-limiting to reduce API spam, but you use this software **at your own risk**. Never share your Discord User Token with anyone.

---

## 🔑 Cara Mendapatkan Discord User Token (How to Get Discord User Token)

Untuk menjalankan bot ini di Web Dashboard maupun Local Terminal, Anda memerlukan **Discord User Token**. Ikuti petunjuk bergambar/langkah mudah berikut:

### Langkah 1: Buka Discord di Browser
1. Buka Google Chrome / Brave / Edge / Safari di Komputer/Mac Anda.
2. Buka dan login ke [Discord Web App](https://discord.com/app).

### Langkah 2: Buka Developer Tools (Inspeksi Elemen)
1. Tekan tombol pintas keyboard:
   - **Mac**: `Cmd + Option + I` (atau `F12`)
   - **Windows**: `Ctrl + Shift + I` (atau `F12`)
2. Jendela **Developer Tools** akan terbuka di sebelah kanan atau bawah layar.

### Langkah 3: Masuk ke Tab Network
1. Di panel bagian atas Developer Tools, klik tab **`Network`** (letaknya di antara *Sources* dan *Performance*).
2. Jika daftar di bawahnya masih kosong, tekan **`Cmd + R`** (Mac) atau **`Ctrl + R`** (Windows) untuk memuat ulang (*refresh*) halaman Discord.

### Langkah 4: Cari Request `@me`
1. Di kolom pencarian filter tab Network (di bawah tulisan *Network*), ketik: `@me`
2. Di tabel daftar nama sebelah kiri (kolom **Name**), klik item bertuliskan **`{} @me`** (atau item lain berikon kurung kurawal `{}` seperti `credentials` / `entitlements`).

### Langkah 5: Salin Nilai `authorization`
1. Di panel sebelah kanan, klik tab **`Headers`**.
2. Scroll ke bawah sampai menemukan judul bagian **`▼ Request Headers`**.
3. Cari baris bertuliskan **`authorization:`**.
4. Salin (copy) kode string panjang di sampingnya (misal: `NzEyODg4MjcxMTM0MzkyMzYy.G...`).
5. Tempel (paste) token tersebut di kolom **Connect Discord Account** di Web Dashboard Anda!

> **⚠️ PENTING:** Token ini adalah kunci masuk ke akun Discord Anda. Jaga kerahasiannya dan jangan pernah membagikan token ini kepada orang lain!

---

## 🚀 Deployment Guide (Vercel)

1. Push repository ini ke akun GitHub Anda.
2. Buka [Vercel Dashboard](https://vercel.com/dashboard) -> **Add New Project**.
3. Di bagian **Environment Variables**, tambahkan:
   - `SPOTIFY_CLIENT_ID`: Client ID dari Spotify Developer Dashboard
   - `SPOTIFY_CLIENT_SECRET`: Client Secret dari Spotify Developer Dashboard
   - `SPOTIFY_REDIRECT_URI`: `https://NAMA-PROJECT.vercel.app/api/spotify/callback`
4. Di [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), tambahkan Redirect URI di atas, klik **Add** lalu **Save**.
5. Klik **Deploy**!

---

## ⚙️ Configuration Reference

| Environment Variable | Default | Description |
| :--- | :--- | :--- |
| `DISCORD_TOKEN` | *Required* | Your Discord user account token |
| `SPOTIFY_CLIENT_ID` | *Required* | Spotify App Client ID |
| `SPOTIFY_CLIENT_SECRET` | *Required* | Spotify App Client Secret |
| `STATUS_PREFIX` | `🎵 \| ` | Text/emoji prefix before lyric text |
| `LYRIC_OFFSET_MS` | `0` | Delay/advance timing in ms (e.g. `-500` if lyrics appear late) |

---
Built by **Ahmad Fajar Alfaravi**
