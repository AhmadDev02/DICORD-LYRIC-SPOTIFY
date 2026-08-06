import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

export const config = {
  discordToken: process.env.DISCORD_TOKEN || '',
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID || '',
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
  spotifyPort: parseInt(process.env.SPOTIFY_PORT || '8888', 10),
  spotifyRedirectUri: process.env.SPOTIFY_REDIRECT_URI || `http://127.0.0.1:${process.env.SPOTIFY_PORT || 8888}/callback`,
  statusPrefix: process.env.STATUS_PREFIX ?? '🎵 | ',
  lyricOffsetMs: parseInt(process.env.LYRIC_OFFSET_MS || '0', 10),
  minUpdateIntervalMs: parseInt(process.env.MIN_UPDATE_INTERVAL_MS || '1500', 10),
  showTrackIfNoLyrics: process.env.SHOW_TRACK_IF_NO_LYRICS === 'true',
  clearStatusOnPause: process.env.CLEAR_STATUS_ON_PAUSE === 'true',
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '1000', 10),
};

export function validateConfig() {
  const missing = [];
  if (!config.discordToken) missing.push('DISCORD_TOKEN');
  if (!config.spotifyClientId) missing.push('SPOTIFY_CLIENT_ID');
  if (!config.spotifyClientSecret) missing.push('SPOTIFY_CLIENT_SECRET');

  if (missing.length > 0) {
    console.error(`\x1b[31m[CONFIG ERROR] Missing required environment variables in .env:\x1b[0m ${missing.join(', ')}`);
    console.error(`Please copy .env.example to .env and fill in the values.`);
    return false;
  }
  return true;
}
