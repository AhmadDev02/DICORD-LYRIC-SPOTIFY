import { config } from './config.js';

export class StatusBalancer {
  constructor(discordClient) {
    this.discordClient = discordClient;
    this.lastStatusText = null;
    this.lastUpdateTime = 0;
    this.pendingTimeout = null;
  }

  formatLyricStatus(lyricText) {
    if (!lyricText) return null;
    const prefix = config.statusPrefix || '';
    const fullText = `${prefix}${lyricText}`;
    return fullText.length > 128 ? fullText.substring(0, 125) + '...' : fullText;
  }

  formatFallbackStatus(track, isPaused) {
    if (isPaused) {
      if (config.clearStatusOnPause) return null;
      const text = `⏸️ ${track ? track.title : 'Spotify'}`;
      return text.length > 128 ? text.substring(0, 125) + '...' : text;
    }

    if (config.showTrackIfNoLyrics && track) {
      const text = `🎵 ${track.title} - ${track.artist}`;
      return text.length > 128 ? text.substring(0, 125) + '...' : text;
    }

    return null;
  }

  processStatusUpdate(newStatusText) {
    if (newStatusText === this.lastStatusText) {
      return;
    }

    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastUpdateTime;
    const minInterval = config.minUpdateIntervalMs;

    if (timeSinceLastUpdate >= minInterval) {
      this.applyUpdate(newStatusText);
    } else {
      const delay = minInterval - timeSinceLastUpdate;
      if (this.pendingTimeout) clearTimeout(this.pendingTimeout);
      this.pendingTimeout = setTimeout(() => {
        this.applyUpdate(newStatusText);
      }, delay);
    }
  }

  applyUpdate(statusText) {
    this.lastStatusText = statusText;
    this.lastUpdateTime = Date.now();
    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout);
      this.pendingTimeout = null;
    }

    this.discordClient.updateCustomStatus(statusText);
    if (statusText) {
      console.log(`\x1b[35m[STATUS BALANCER]\x1b[0m Updated status: "${statusText}"`);
    } else {
      console.log(`\x1b[35m[STATUS BALANCER]\x1b[0m Cleared custom status`);
    }
  }
}
