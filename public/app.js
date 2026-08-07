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

  // Check URL parameters for Spotify connection callback
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('spotify_connected') === '1') {
    appendLog('[SPOTIFY] Spotify account successfully connected & authorized!', 'success');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  function getSecureToken(key) {
    return sessionStorage.getItem(key) || localStorage.getItem(key) || '';
  }

  function setSecureToken(key, value) {
    sessionStorage.setItem(key, value);
    localStorage.setItem(key, value);
  }

  function removeSecureToken(key) {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  }

  // Load stored configurations sequentially
  const storedToken = getSecureToken('discord_token');
  if (storedToken) {
    discordTokenInput.value = storedToken;
    clearDiscordTokenBtn.classList.remove('hidden');

    (async () => {
      await updateUserBadge(storedToken);
      if (getSecureToken('auto_sync_enabled') === 'true') {
        toggleSyncBtn.checked = true;
        startGatewaySync(storedToken);
      }
    })();
  }

  const storedOffset = getSecureToken('lyric_offset_ms');
  if (storedOffset) {
    offsetInput.value = storedOffset;
  }

  // Check Copyright Integrity
  const footerText = document.querySelector('.app-footer')?.textContent || '';
  if (!footerText.includes('AhmadDev02')) {
    appendLog('[COPYRIGHT WARNING] Project ini memiliki hak cipta ciptaan AhmadDev02. Modifikasi tanpa izin terdeteksi!', 'error');
  }

  const tokenGuideBtn = document.getElementById('token-guide-btn');
  const tokenModal = document.getElementById('token-modal');
  const closeModalBtn = document.getElementById('close-modal-btn');

  if (tokenGuideBtn && tokenModal && closeModalBtn) {
    tokenGuideBtn.addEventListener('click', () => {
      tokenModal.classList.remove('hidden');
    });

    closeModalBtn.addEventListener('click', () => {
      tokenModal.classList.add('hidden');
    });

    tokenModal.addEventListener('click', (e) => {
      if (e.target === tokenModal) {
        tokenModal.classList.add('hidden');
      }
    });
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
    setSecureToken('discord_token', token);
    clearDiscordTokenBtn.classList.remove('hidden');
    appendLog('[DISCORD] Token saved securely in browser session.', 'success');
    await updateUserBadge(token);
    alert('Discord Token saved successfully!');
  });

  clearDiscordTokenBtn.addEventListener('click', () => {
    removeSecureToken('discord_token');
    removeSecureToken('auto_sync_enabled');
    discordTokenInput.value = '';
    clearDiscordTokenBtn.classList.add('hidden');
    userProfileBadge.classList.add('hidden');
    userNameText.textContent = 'Not Connected';
    stopGatewaySync();
    toggleSyncBtn.checked = false;
    appendLog('[DISCORD] Token removed completely from browser storage.', 'warning');
    alert('Discord Token cleared!');
  });

  spotifyLoginBtn.addEventListener('click', () => {
    window.location.href = '/api/spotify/login';
  });

  toggleSyncBtn.addEventListener('change', (e) => {
    if (e.target.checked) {
      const token = getSecureToken('discord_token');
      if (!token) {
        alert('Please save your Discord Token first before enabling sync!');
        e.target.checked = false;
        return;
      }
      setSecureToken('auto_sync_enabled', 'true');
      startGatewaySync(token);
    } else {
      setSecureToken('auto_sync_enabled', 'false');
      stopGatewaySync();
    }
  });

  offsetInput.addEventListener('change', (e) => {
    setSecureToken('lyric_offset_ms', e.target.value);
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
      const res = await fetch('/api/sync', {
        headers: { Authorization: token },
      });
      if (res.ok) {
        const data = await res.json();
        userProfileBadge.classList.remove('hidden');
        userNameText.textContent = data.username || 'Connected User';
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
      this.reconnectTimer = null;
      this.isManualDisconnect = false;
      this.sequence = null;
      this.selfUserId = null;
      this.userStatus = 'online';
      this.currentTrackId = null;
      this.currentLyrics = null;
      this.lastStatusText = null;
      this.lastSpotifyActivity = null;
      this.loopInterval = null;
      this.restFallbackTimer = 0;
    }

    connect() {
      this.isManualDisconnect = false;
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
        if (this.ws) {
          appendLog(`[DISCORD] Gateway Connection Closed (code ${e.code}).`, 'warning');
          this.cleanup();
          if (!this.isManualDisconnect) {
            appendLog('[DISCORD] Connection lost. Auto-reconnecting in 3 seconds...', 'info');
            this.reconnectTimer = setTimeout(() => {
              if (!this.isManualDisconnect) {
                this.connect();
              }
            }, 3000);
          }
        }
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

    async pollSpotifyDirectAPI() {
      const spotifyToken = getSecureToken('spotify_access_token');
      if (!spotifyToken) return false;

      try {
        const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
          headers: { Authorization: `Bearer ${spotifyToken}` },
        });

        if (res.status === 401 || res.status === 403) {
          removeSecureToken('spotify_access_token');
          return false;
        }

        if (res.ok && res.status === 200) {
          const data = await res.json();
          if (data && data.is_playing && data.item) {
            const track = data.item;
            this.lastSpotifyActivity = {
              name: 'Spotify',
              type: 2,
              details: track.name,
              state: track.artists ? track.artists.map((a) => a.name).join(', ') : 'Unknown Artist',
              sync_id: track.id,
              timestamps: {
                start: Date.now() - (data.progress_ms || 0),
                end: Date.now() + (track.duration_ms - (data.progress_ms || 0)),
              },
              assets: { large_text: track.album ? track.album.name : '' },
            };
            return true;
          }
        }
      } catch (e) {}

      return false;
    }

    async pollRestProfileFallback() {
      if (!this.token) return;

      // 1. Try Direct Spotify OAuth API if connected
      const foundViaSpotify = await this.pollSpotifyDirectAPI();
      if (foundViaSpotify) return;

      // 2. Fallback to Vercel Serverless Sync API
      try {
        const offset = offsetInput.value || 0;
        const res = await fetch(`/api/sync?offset=${offset}`, {
          headers: { Authorization: this.token },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.userStatus) {
            this.userStatus = data.userStatus;
            updateStatusDot(data.userStatus);
          }
          if (data.isPlaying && data.track) {
            const sameTrack = this.lastSpotifyActivity && (this.lastSpotifyActivity.sync_id === data.track.id || this.lastSpotifyActivity.details === data.track.title);
            const currentStart = sameTrack && this.lastSpotifyActivity.timestamps ? this.lastSpotifyActivity.timestamps.start : Date.now();
            const currentEnd = currentStart + (data.track.durationMs || 180000);

            this.lastSpotifyActivity = {
              name: 'Spotify',
              type: 2,
              details: data.track.title,
              state: data.track.artist,
              sync_id: data.track.id,
              timestamps: { start: currentStart, end: currentEnd },
              assets: { large_text: data.track.album || '' },
            };
          }
        }
      } catch (e) {}
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

      // Poll Spotify Direct API or Serverless fallback every 2 seconds
      const now = Date.now();
      if (now - this.restFallbackTimer > 2000) {
        this.restFallbackTimer = now;
        await this.pollRestProfileFallback();
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

        this.currentLyrics = await getLyricsForTrack(track);
        if (this.currentLyrics && this.currentLyrics.length > 0) {
          appendLog(`[LYRICS ENGINE] Found ${this.currentLyrics.length} synced lyric lines.`, 'lrclib');
        } else {
          appendLog(`[LYRICS ENGINE] No synced lyrics found for this track.`, 'warning');
        }
      }

      const offsetMs = parseInt(offsetInput.value || '0', 10);
      const activeLine = getActiveLyricLine(this.currentLyrics, progressMs, offsetMs);

      const formattedStatus = activeLine
        ? `🎵 | ${activeLine.text}`.substring(0, 128)
        : `🎵 ${track.title} - ${track.artist}`.substring(0, 128);

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
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      if (this.loopInterval) clearInterval(this.loopInterval);
      this.heartbeatInterval = null;
      this.reconnectTimer = null;
      this.loopInterval = null;
    }

    disconnect() {
      this.isManualDisconnect = true;
      this.cleanup();
      if (this.ws) {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        try {
          this.ws.close();
        } catch (e) {}
        this.ws = null;
      }
    }
  }

  async function getLyricsForTrack(track) {
    if (!track || !track.title) return null;
    const spotifyToken = getSecureToken('spotify_access_token');

    try {
      const params = new URLSearchParams({
        trackId: track.id || '',
        title: track.title || '',
        artist: track.artist || '',
        durationMs: track.durationMs || 180000,
      });

      const res = await fetch(`/api/spotify/lyrics?${params.toString()}`, {
        headers: spotifyToken ? { Authorization: spotifyToken } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.lines && Array.isArray(data.lines) && data.lines.length > 0) {
          if (data.source === 'spotify_official' || data.source === 'spotify_official_auto_timed') {
            appendLog(`[SPOTIFY OFFICIAL LYRICS] Loaded ${data.lines.length} synced lyric lines directly from Spotify!`, 'success');
          } else if (data.source === 'genius') {
            appendLog(`[GENIUS LYRICS] Loaded ${data.lines.length} lyric lines from Genius Database!`, 'success');
          } else if (data.source === 'netease') {
            appendLog(`[NETEASE LYRICS] Loaded ${data.lines.length} synced lyric lines from NetEase Cloud Music!`, 'success');
          } else if (data.source === 'lrclib_plain_auto_timed') {
            appendLog(`[LRCLIB LYRICS ENGINE] Loaded ${data.lines.length} lyric lines (Auto-Paced Sync Engine active)!`, 'success');
          } else {
            appendLog(`[LRCLIB] Loaded ${data.lines.length} synced lyric lines from LRCLIB database.`, 'lrclib');
          }
          return data.lines;
        }
      }
    } catch (e) {
      appendLog(`[ERROR] Failed to fetch lyrics: ${e.message}`, 'error');
    }

    return null;
  }

  function cleanTrackTitle(title) {
    if (!title) return '';
    return title
      .replace(/[\(\[\{].*?[\)\]\}]/g, '')
      .replace(/-.*$/, '')
      .trim();
  }

  async function fetchLyricsFromLRCLIB(track) {
    try {
      // 1. Try Exact Match
      const params = new URLSearchParams({
        track_name: track.title,
        artist_name: track.artist,
      });
      if (track.album) params.append('album_name', track.album);
      if (track.durationMs) params.append('duration', Math.round(track.durationMs / 1000).toString());

      let res = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.syncedLyrics) return parseLRC(data.syncedLyrics);
      }

      // 2. Try Clean Title Match
      const cleaned = cleanTrackTitle(track.title);
      if (cleaned && cleaned !== track.title) {
        const cleanParams = new URLSearchParams({
          track_name: cleaned,
          artist_name: track.artist,
        });
        res = await fetch(`https://lrclib.net/api/get?${cleanParams.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.syncedLyrics) return parseLRC(data.syncedLyrics);
        }
      }

      // 3. Fallback to Fuzzy Search
      const searchQuery = `${cleaned || track.title} ${track.artist}`.trim();
      const searchRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(searchQuery)}`);
      if (searchRes.ok) {
        const results = await searchRes.json();
        if (Array.isArray(results) && results.length > 0) {
          const matched = results.find((item) => item.syncedLyrics && item.syncedLyrics.trim().length > 0);
          if (matched) return parseLRC(matched.syncedLyrics);
        }
      }

      return null;
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
