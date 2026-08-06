# 🎵 Discord Spotify Lyric Status Engine

A real-time Node.js application that synchronizes your currently playing Spotify lyrics into your Discord Custom Status automatically, built with smart timing balance and rate-limiting protection.

---

## 🌟 Features

- **⚡ Real-time Lyric Sync**: Fetch synchronized LRC lyrics automatically from [LRCLIB](https://lrclib.net/).
- **⚖️ Smart Balance Engine**:
  - **Rate Limit Balancer**: Prevents Discord API rate-limiting by throttling status updates and updating status only on lyric changes.
  - **Latency & Offset Adjuster**: Easily adjust lyric delay (`LYRIC_OFFSET_MS`) to match your exact audio sync.
- **🔄 Auto Refresh & Reconnect**: Handles Spotify OAuth token refresh and Discord Gateway WebSocket auto-reconnections.
- **🎨 Fallback Status Options**: Shows song title/artist when lyrics aren't found or when music is paused.

---

## ⚠️ Important Warning (Self-Bot Notice)

> **Automating custom status updates using a user token technically violates Discord's Terms of Service.**
> This project uses rate-limiting to reduce API spam, but you use this software **at your own risk**. Never share your Discord User Token with anyone.

---

## 🚀 Setup & Installation Guide (Panduan Setting)

### 1. Requirements
- **Node.js**: v18.0.0 or higher.
- A **Spotify** account (Free or Premium).
- A **Discord** account.

### 2. Install Dependencies
```bash
npm install
```

### 3. Get Spotify Developer Credentials
1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Click **Create an App** (or edit existing app settings).
3. Set **App Name** (e.g. `DiscordLyricStatus`).
4. Under **Redirect URIs**, type: `http://127.0.0.1:8888/callback`
5. **Penting:** Klik tombol **Add** (warna biru di sebelah kanan kolom input) agar URI masuk ke daftar.
6. Beri centang pada opsi **Web API** di bagian *"Which API/SDKs are you planning to use?"*.
7. Klik tombol **Save** di bagian bawah.
8. Copy **Client ID** dan **Client Secret** (klik *View client secret*).

### 4. Get Your Discord User Token
1. Open Discord in your Web Browser (or Discord Desktop App).
2. Press `Ctrl + Shift + I` (or `Cmd + Option + I` on Mac) to open Developer Tools.
3. Select the **Network** tab.
4. Filter/search for `api` or `/users/@me`.
5. Send any message or switch channels in Discord.
6. Click on a request (e.g. `@me`) and find **`Authorization`** under **Request Headers**.
7. Copy the token value (Do NOT share this token with anyone!).

### 5. Configure `.env`
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in `.env`:
```env
DISCORD_TOKEN=your_discord_user_token_here
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here
SPOTIFY_PORT=8888
STATUS_PREFIX=🎵 | 
LYRIC_OFFSET_MS=0
MIN_UPDATE_INTERVAL_MS=1500
SHOW_TRACK_IF_NO_LYRICS=true
CLEAR_STATUS_ON_PAUSE=false
```

---

## 🏃 Running the Application

Start the engine:
```bash
npm start
```

1. On **first launch**, the terminal will prompt you to open:
   `http://localhost:8888/login`
2. Log in with your Spotify account and approve permissions.
3. Tokens will be saved locally in `tokens.json`.
4. Play a song on Spotify and watch your Discord status update live! 🎧

---

## ⚙️ Configuration Reference

| Environment Variable | Default | Description |
| :--- | :--- | :--- |
| `DISCORD_TOKEN` | *Required* | Your Discord user account token |
| `SPOTIFY_CLIENT_ID` | *Required* | Spotify App Client ID |
| `SPOTIFY_CLIENT_SECRET` | *Required* | Spotify App Client Secret |
| `STATUS_PREFIX` | `🎵 \| ` | Text/emoji prefix before lyric text |
| `LYRIC_OFFSET_MS` | `0` | Delay/advance timing in ms (e.g. `-500` if lyrics appear late) |
| `MIN_UPDATE_INTERVAL_MS`| `1500` | Minimum delay (ms) between Discord status updates (Rate limit balancer) |
| `SHOW_TRACK_IF_NO_LYRICS`| `true` | Show song title if LRCLIB doesn't have synced lyrics |
| `CLEAR_STATUS_ON_PAUSE` | `false` | Clear status when Spotify is paused (or show `⏸️ Track`) |
