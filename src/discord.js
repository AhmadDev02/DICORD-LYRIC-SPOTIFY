import WebSocket from 'ws';

export async function fetchDiscordSpotifyPresence(token) {
  try {
    const res = await fetch('https://discord.com/api/v9/users/@me/profile', {
      headers: {
        Authorization: token,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const activities = data.user_profile?.activities || data.activities || [];
    const status = data.user_profile?.status || data.status || 'online';

    if (status === 'invisible' || status === 'offline') {
      return { isPlaying: false, track: null, isInvisible: true, userStatus: status };
    }

    const spotifyAct = activities.find(
      (a) => a.name === 'Spotify' || a.type === 2 || (a.party && a.party.id && a.party.id.startsWith('spotify:'))
    );

    if (!spotifyAct || !spotifyAct.details) return { isPlaying: false, track: null, userStatus: status };

    const startTime = spotifyAct.timestamps ? spotifyAct.timestamps.start : Date.now();
    const endTime = spotifyAct.timestamps ? spotifyAct.timestamps.end : null;
    const durationMs = endTime && startTime ? endTime - startTime : 0;
    const progressMs = Math.max(0, Date.now() - startTime);

    return {
      isPlaying: true,
      fetchTimestamp: Date.now(),
      progressMs,
      userStatus: status,
      track: {
        id: spotifyAct.sync_id || `${spotifyAct.details}-${spotifyAct.state}`,
        title: spotifyAct.details,
        artist: spotifyAct.state || 'Unknown Artist',
        album: spotifyAct.assets ? spotifyAct.assets.large_text : '',
        durationMs: durationMs,
      },
    };
  } catch (err) {
    return null;
  }
}

export class DiscordGatewayClient {
  constructor(token, onSpotifyPresenceUpdate) {
    this.token = token;
    this.onSpotifyPresenceUpdate = onSpotifyPresenceUpdate;
    this.ws = null;
    this.heartbeatInterval = null;
    this.sequence = null;
    this.isConnected = false;
    this.currentStatusText = null;
    this.reconnectTimeout = null;
    this.selfUserId = null;
    this.userStatus = 'online';
    this.currentSpotifyPresence = null;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    console.log('[DISCORD] Connecting to Discord Gateway...');
    this.ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');

    this.ws.on('open', () => {
      console.log('[DISCORD] Gateway Connection Opened.');
    });

    this.ws.on('message', (data) => {
      try {
        const payload = JSON.parse(data.toString());
        this.handlePayload(payload);
      } catch (err) {
        console.error('[DISCORD] Gateway payload parsing error:', err.message);
      }
    });

    this.ws.on('close', (code, reason) => {
      console.warn(`[DISCORD] Gateway closed with code ${code} (${reason || 'No reason'})`);
      this.cleanup();
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[DISCORD] Gateway WebSocket error:', err.message);
    });
  }

  handlePayload(payload) {
    const { op, d, t, s } = payload;
    if (s !== null && s !== undefined) {
      this.sequence = s;
    }

    switch (op) {
      case 10:
        this.startHeartbeat(d.heartbeat_interval);
        this.identify();
        break;

      case 11:
        break;

      case 0:
        if (t === 'READY') {
          this.isConnected = true;
          this.selfUserId = d.user.id;
          if (d.user_settings && d.user_settings.status) {
            this.userStatus = d.user_settings.status;
          } else if (d.sessions && d.sessions[0] && d.sessions[0].status) {
            this.userStatus = d.sessions[0].status;
          }
          console.log(`\x1b[32m[DISCORD] Authenticated as ${d.user.username} (${d.user.id}) [Status: ${this.userStatus}]\x1b[0m`);
          
          if (d.sessions) {
            for (const sess of d.sessions) {
              if (sess.activities) this.parseActivities(sess.activities);
            }
          }

          if (this.currentStatusText) {
            this.sendCustomStatus(this.currentStatusText);
          }
        } else if (t === 'PRESENCE_UPDATE') {
          if (d.user && d.user.id === this.selfUserId) {
            if (d.status) this.userStatus = d.status;
            if (d.activities) this.parseActivities(d.activities);
          }
        } else if (t === 'SESSIONS_REPLACE') {
          if (Array.isArray(d)) {
            for (const sess of d) {
              if (sess.status) this.userStatus = sess.status;
              if (sess.activities) this.parseActivities(sess.activities);
            }
          }
        }
        break;

      case 7:
      case 9:
        console.warn('[DISCORD] Received Reconnect/Invalid Session opcode from Gateway.');
        this.reconnect();
        break;
    }
  }

  parseActivities(activities) {
    if (!activities || !Array.isArray(activities)) return;

    if (this.userStatus === 'invisible' || this.userStatus === 'offline') {
      return;
    }

    const spotifyAct = activities.find(
      (a) => a.name === 'Spotify' || a.type === 2 || (a.party && a.party.id && a.party.id.startsWith('spotify:'))
    );

    if (!spotifyAct || !spotifyAct.details) return;

    const startTime = spotifyAct.timestamps ? spotifyAct.timestamps.start : Date.now();
    const endTime = spotifyAct.timestamps ? spotifyAct.timestamps.end : null;
    const durationMs = endTime && startTime ? endTime - startTime : 0;
    const progressMs = Math.max(0, Date.now() - startTime);

    const presenceInfo = {
      isPlaying: true,
      fetchTimestamp: Date.now(),
      progressMs,
      userStatus: this.userStatus,
      track: {
        id: spotifyAct.sync_id || `${spotifyAct.details}-${spotifyAct.state}`,
        title: spotifyAct.details,
        artist: spotifyAct.state || 'Unknown Artist',
        album: spotifyAct.assets ? spotifyAct.assets.large_text : '',
        durationMs: durationMs,
      },
    };

    this.updateSpotifyPresence(presenceInfo);
  }

  updateSpotifyPresence(presenceInfo) {
    this.currentSpotifyPresence = presenceInfo;
    if (this.onSpotifyPresenceUpdate) {
      this.onSpotifyPresenceUpdate(presenceInfo);
    }
  }

  startHeartbeat(intervalMs) {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ op: 1, d: this.sequence }));
      }
    }, intervalMs);
  }

  identify() {
    const payload = {
      op: 2,
      d: {
        token: this.token,
        capabilities: 16381,
        properties: {
          os: 'Mac OS X',
          browser: 'Discord Client',
          device: '',
          system_locale: 'en-US',
          client_version: '1.0.9015',
          os_version: '21.6.0',
        },
        presence: {
          status: 'online',
          since: 0,
          activities: [],
          afk: false,
        },
      },
    };
    this.ws.send(JSON.stringify(payload));
  }

  updateCustomStatus(text) {
    if (this.userStatus === 'invisible' || this.userStatus === 'offline') {
      console.log('\x1b[33m[DISCORD STATUS]\x1b[0m Skipping status update because user status is INVISIBLE/OFFLINE.');
      return;
    }
    this.currentStatusText = text;
    this.sendCustomStatus(text);
  }

  async sendCustomStatus(text) {
    if (this.userStatus === 'invisible' || this.userStatus === 'offline') {
      return;
    }

    const activities = text
      ? [
          {
            name: 'Custom Status',
            type: 4,
            state: text,
            emoji: null,
          },
        ]
      : [];

    const payload = {
      op: 3,
      d: {
        since: 0,
        activities: activities,
        status: this.userStatus || 'online',
        afk: false,
      },
    };

    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(payload));
      }
    } catch (e) {}

    try {
      await fetch('https://discord.com/api/v9/users/@me/settings', {
        method: 'PATCH',
        headers: {
          Authorization: this.token,
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        body: JSON.stringify({
          custom_status: text ? { text: text } : null,
        }),
      });
    } catch (err) {
      console.error('[DISCORD REST] Failed to patch custom status:', err.message);
    }
  }

  cleanup() {
    this.isConnected = false;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  reconnect() {
    this.cleanup();
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
    }
    this.connect();
  }

  scheduleReconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, 5000);
  }
}
