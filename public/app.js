document.addEventListener('DOMContentLoaded', () => {
  const discordTokenInput = document.getElementById('discord-token-input');
  const saveDiscordTokenBtn = document.getElementById('save-discord-token-btn');
  const clearDiscordTokenBtn = document.getElementById('clear-discord-token-btn');
  const spotifyLoginBtn = document.getElementById('spotify-login-btn');
  const userProfileBadge = document.getElementById('user-profile-badge');
  const userStatusDot = document.getElementById('user-status-dot');
  const userNameText = document.getElementById('user-name-text');
  const syncEngineBadge = document.getElementById('sync-engine-badge');
  const toggleSyncBtn = document.getElementById('toggle-sync-btn');
  const offsetInput = document.getElementById('offset-input');
  const terminalLogsEl = document.getElementById('terminal-logs');
  const clearConsoleBtn = document.getElementById('clear-console-btn');

  const trackTitleEl = document.getElementById('track-title');
  const trackArtistEl = document.getElementById('track-artist');
  const liveLyricTextEl = document.getElementById('live-lyric-text');

  let gatewayEngine = null;

  // Load stored configurations
  const storedToken = localStorage.getItem('discord_token');
  if (storedToken) {
    discordTokenInput.value = storedToken;
    clearDiscordTokenBtn.classList.remove('hidden');
    updateUserBadge(storedToken);
  }

  const storedOffset = localStorage.getItem('lyric_offset_ms');
  if (storedOffset) {
    offsetInput.value = storedOffset;
  }

  // Check Copyright Integrity
  const footerText = document.querySelector('.app-footer')?.textContent || '';
  if (!footerText.includes('Ahmad Fajar Alfaravi')) {
    appendLog('[COPYRIGHT WARNING] Project ini memiliki hak cipta ciptaan Ahmad Fajar Alfaravi. Modifikasi tanpa izin terdeteksi!', 'error');
  }

  clearConsoleBtn.addEventListener('click', () => {
    terminalLogsEl.innerHTML = '';
    appendLog('[SYSTEM] Console logs cleared.', 'info');
  });

  saveDiscordTokenBtn.addEventListener('click', async () => {
    const token = discordTokenInput.value.trim();
    if (!token) {
      alert('Please enter a valid Discord User Token.');
      return;
    }
    localStorage.setItem('discord_token', token);
    clearDiscordTokenBtn.classList.remove('hidden');
    appendLog('[DISCORD] Token saved to local browser storage.', 'success');
    await updateUserBadge(token);
    alert('Discord Token saved successfully!');
  });

  clearDiscordTokenBtn.addEventListener('click', () => {
    localStorage.removeItem('discord_token');
    discordTokenInput.value = '';
    clearDiscordTokenBtn.classList.add('hidden');
    userProfileBadge.classList.add('hidden');
    stopGatewaySync();
    toggleSyncBtn.checked = false;
    appendLog('[DISCORD] Token removed from browser storage.', 'warning');
    alert('Discord Token cleared!');
  });

  spotifyLoginBtn.addEventListener('click', () => {
    window.location.href = '/api/spotify/login';
  });

  toggleSyncBtn.addEventListener('change', (e) => {
    if (e.target.checked) {
      const token = localStorage.getItem('discord_token');
      if (!token) {
        alert('Please save your Discord Token first before enabling sync!');
        e.target.checked = false;
        return;
      }
      startGatewaySync(token);
    } else {
      stopGatewaySync();
    }
  });

  offsetInput.addEventListener('change', (e) => {
    localStorage.setItem('lyric_offset_ms', e.target.value);
    appendLog(`[CONFIG] Lyric offset updated to ${e.target.value} ms`, 'info');
  });

  function appendLog(message, type = 'info') {
    const logLine = document.createElement('div');
    logLine.className = `log-line log-${type}`;
    logLine.textContent = message;
    terminalLogsEl.appendChild(logLine);
    terminalLogsEl.scrollTop = terminalLogsEl.scrollHeight;
  }

  async function updateUserBadge(token) {
    try {
      const res = await fetch('https://discord.com/api/v9/users/@me', {
        headers: { Authorization: token },
      });
      if (res.ok) {
        const data = await res.json();
        userProfileBadge.classList.remove('hidden');
        userNameText.textContent = `${data.username}`;
        appendLog(`[DISCORD] Authenticated as ${data.username} (${data.id})`, 'success');
      } else {
        appendLog(`[ERROR] Invalid Discord Token (HTTP ${res.status}). Please check your token.`, 'error');
      }
    } catch (e) {
      appendLog(`[ERROR] Network error validating token: ${e.message}`, 'error');
    }
  }

  function startGatewaySync(token) {
    syncEngineBadge.textContent = 'RUNNING';
    syncEngineBadge.className = 'badge-status badge-running';

    appendLog('[ENGINE] Starting playback & lyrics sync loop...', 'info');

    if (gatewayEngine) {
      gatewayEngine.disconnect();
    }

    gatewayEngine = new BrowserDiscordGatewayEngine(token);
    gatewayEngine.connect();
  }

  function stopGatewaySync() {
    if (gatewayEngine) {
      gatewayEngine.disconnect();
      gatewayEngine = null;
    }

    syncEngineBadge.textContent = 'STOPPED';
    syncEngineBadge.className = 'badge-status badge-stopped';
    liveLyricTextEl.textContent = '🎵 Sync paused.';
    appendLog('[ENGINE] Playback & lyrics sync loop stopped.', 'warning');
  }

  class BrowserDiscordGatewayEngine {
    constructor(token) {
      this.token = token;
      this.ws = null;
      this.heartbeatInterval = null;
      this.sequence = null;
      this.selfUserId = null;
      this.userStatus = 'online';
      this.currentTrackId = null;
      this.currentLyrics = null;
      this.lastStatusText = null;
      this.lastSpotifyActivity = null;
      this.loopInterval = null;
    }

    connect() {
      appendLog('[DISCORD] Connecting to Discord Gateway...', 'info');
      this.ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');

      this.ws.onopen = () => {
        appendLog('[DISCORD] Gateway Connection Opened.', 'success');
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.handlePayload(payload);
        } catch (e) {
          console.error('WebSocket payload error:', e);
        }
      };

      this.ws.onclose = (e) => {
        appendLog(`[DISCORD] Gateway Connection Closed (code ${e.code}).`, 'warning');
        this.cleanup();
      };

      this.ws.onerror = (err) => {
        appendLog('[ERROR] Gateway WebSocket error.', 'error');
      };
    }

    handlePayload(payload) {
      const { op, d, t, s } = payload;
      if (s !== null && s !== undefined) this.sequence = s;

      if (op === 10) {
        // Hello -> Heartbeat & Identify
        this.heartbeatInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ op: 1, d: this.sequence }));
          }
        }, d.heartbeat_interval);

        this.ws.send(
          JSON.stringify({
            op: 2,
            d: {
              token: this.token,
              capabilities: 16381,
              properties: {
                os: 'Mac OS X',
                browser: 'Discord Client',
                device: '',
              },
              presence: {
                status: 'online',
                since: 0,
                activities: [],
                afk: false,
              },
            },
          })
        );
      } else if (op === 0) {
        if (t === 'READY') {
          this.selfUserId = d.user.id;
          if (d.user_settings && d.user_settings.status) this.userStatus = d.user_settings.status;
          else if (d.sessions && d.sessions[0] && d.sessions[0].status) this.userStatus = d.sessions[0].status;

          appendLog(`[DISCORD] Authenticated as ${d.user.username} (${d.user.id}) [Status: ${this.userStatus}]`, 'success');
          updateStatusDot(this.userStatus);

          if (d.sessions) {
            for (const sess of d.sessions) {
              if (sess.activities) this.processActivities(sess.activities);
            }
          }

          this.startSyncLoop();
        } else if (t === 'PRESENCE_UPDATE') {
          if (d.user && d.user.id === this.selfUserId) {
            if (d.status) {
              this.userStatus = d.status;
              updateStatusDot(d.status);
            }
            if (d.activities) this.processActivities(d.activities);
          }
        } else if (t === 'SESSIONS_REPLACE') {
          if (Array.isArray(d)) {
            for (const sess of d) {
              if (sess.status) {
                this.userStatus = sess.status;
                updateStatusDot(sess.status);
              }
              if (sess.activities) this.processActivities(sess.activities);
            }
          }
        }
      }
    }

    processActivities(activities) {
      if (!activities || !Array.isArray(activities)) return;

      const spotifyAct = activities.find(
        (a) => a.name === 'Spotify' || a.type === 2 || (a.party && a.party.id && a.party.id.startsWith('spotify:'))
      );

      if (spotifyAct) {
        this.lastSpotifyActivity = spotifyAct;
      }
    }

    startSyncLoop() {
      if (this.loopInterval) clearInterval(this.loopInterval);
      this.loopInterval = setInterval(async () => {
        await this.syncTick();
      }, 1000);
    }

    async syncTick() {
      // Check Status Rule
      if (this.userStatus === 'invisible' || this.userStatus === 'offline') {
        liveLyricTextEl.textContent = '⚪ Status is INVISIBLE. Sync paused automatically.';
        trackTitleEl.textContent = 'Status is Invisible';
        trackArtistEl.textContent = 'Switch status to Online/Idle/DND to resume lyrics';
        if (this.lastStatusText !== '__INVISIBLE__') {
          this.lastStatusText = '__INVISIBLE__';
          appendLog(`[STATUS RULE] User is INVISIBLE/OFFLINE. Skipping status updates.`, 'warning');
        }
        return;
      }

      // Check if active song expired
      if (this.lastSpotifyActivity && this.lastSpotifyActivity.timestamps && this.lastSpotifyActivity.timestamps.end) {
        if (Date.now() > this.lastSpotifyActivity.timestamps.end + 5000) {
          this.lastSpotifyActivity = null;
        }
      }

      const spotifyAct = this.lastSpotifyActivity;
      if (!spotifyAct || !spotifyAct.details) {
        trackTitleEl.textContent = 'No Track Playing';
        trackArtistEl.textContent = 'Play music on Spotify to start lyrics';
        liveLyricTextEl.textContent = '🎵 Waiting for Spotify playback...';
        this.currentTrackId = null;
        return;
      }

      const startTime = spotifyAct.timestamps ? spotifyAct.timestamps.start : Date.now();
      const endTime = spotifyAct.timestamps ? spotifyAct.timestamps.end : null;
      const durationMs = endTime && startTime ? endTime - startTime : 0;
      const progressMs = Math.max(0, Date.now() - startTime);

      const track = {
        id: spotifyAct.sync_id || `${spotifyAct.details}-${spotifyAct.state}`,
        title: spotifyAct.details,
        artist: spotifyAct.state || 'Unknown Artist',
        album: spotifyAct.assets ? spotifyAct.assets.large_text : '',
        durationMs: durationMs,
      };

      trackTitleEl.textContent = track.title;
      trackArtistEl.textContent = track.artist;

      // Track change
      if (this.currentTrackId !== track.id) {
        this.currentTrackId = track.id;
        appendLog(`[SPOTIFY NOW PLAYING] ${track.title} - ${track.artist}`, 'spotify');

        this.currentLyrics = await fetchLyricsFromLRCLIB(track);
        if (this.currentLyrics && this.currentLyrics.length > 0) {
          appendLog(`[LRCLIB] Found ${this.currentLyrics.length} synced lyric lines.`, 'lrclib');
        } else {
          appendLog(`[LRCLIB] No synced lyrics found for this track.`, 'warning');
        }
      }

      const offsetMs = parseInt(offsetInput.value || '0', 10);
      const activeLine = getActiveLyricLine(this.currentLyrics, progressMs, offsetMs);

      const lyricText = activeLine ? activeLine.text : `🎵 ${track.title}`;
      const formattedStatus = `🎵 | ${lyricText}`.substring(0, 128);

      liveLyricTextEl.textContent = formattedStatus;

      if (formattedStatus !== this.lastStatusText) {
        this.lastStatusText = formattedStatus;

        try {
          const patchRes = await fetch('https://discord.com/api/v9/users/@me/settings', {
            method: 'PATCH',
            headers: {
              Authorization: this.token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              custom_status: { text: formattedStatus },
            }),
          });

          if (patchRes.ok) {
            appendLog(`[STATUS BALANCER] Updated status: "${formattedStatus}"`, 'balancer');
          } else {
            appendLog(`[ERROR] Failed to update Discord status (HTTP ${patchRes.status})`, 'error');
          }
        } catch (err) {
          appendLog(`[ERROR] Status patch failed: ${err.message}`, 'error');
        }
      }
    }

    cleanup() {
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
      if (this.loopInterval) clearInterval(this.loopInterval);
      this.heartbeatInterval = null;
      this.loopInterval = null;
    }

    disconnect() {
      this.cleanup();
      if (this.ws) {
        try {
          this.ws.close();
        } catch (e) {}
        this.ws = null;
      }
    }
  }

  async function fetchLyricsFromLRCLIB(track) {
    try {
      const params = new URLSearchParams({
        track_name: track.title,
        artist_name: track.artist,
      });
      if (track.album) params.append('album_name', track.album);
      if (track.durationMs) params.append('duration', Math.round(track.durationMs / 1000).toString());

      const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
      if (!res.ok) return null;

      const data = await res.json();
      if (!data || !data.syncedLyrics) return null;

      return parseLRC(data.syncedLyrics);
    } catch (e) {
      return null;
    }
  }

  function parseLRC(lrcText) {
    if (!lrcText) return [];
    const lines = lrcText.split('\n');
    const result = [];
    const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      timeRegex.lastIndex = 0;
      let match;
      const timestamps = [];
      while ((match = timeRegex.exec(trimmed)) !== null) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        let ms = 0;
        if (match[3]) {
          ms = match[3].length === 2 ? parseInt(match[3], 10) * 10 : parseInt(match[3], 10);
        }
        timestamps.push(minutes * 60 * 1000 + seconds * 1000 + ms);
      }
      const lyricText = trimmed.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, '').trim();
      for (const timeMs of timestamps) {
        result.push({ ms: timeMs, text: lyricText });
      }
    }
    result.sort((a, b) => a.ms - b.ms);
    return result;
  }

  function getActiveLyricLine(parsedLines, currentMs, offsetMs = 0) {
    if (!parsedLines || parsedLines.length === 0) return null;
    const adjustedMs = currentMs + offsetMs;
    let activeLine = null;
    for (let i = 0; i < parsedLines.length; i++) {
      if (parsedLines[i].ms <= adjustedMs) {
        activeLine = parsedLines[i];
      } else {
        break;
      }
    }
    return activeLine;
  }

  function updateStatusDot(status) {
    userStatusDot.className = 'status-dot';
    if (status === 'online') userStatusDot.classList.add('dot-online');
    else if (status === 'idle') userStatusDot.classList.add('dot-idle');
    else if (status === 'dnd') userStatusDot.classList.add('dot-dnd');
    else userStatusDot.classList.add('dot-invisible');
  }
});
