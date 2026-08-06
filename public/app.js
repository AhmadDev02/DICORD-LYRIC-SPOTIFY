document.addEventListener('DOMContentLoaded', () => {
  const discordTokenInput = document.getElementById('discord-token-input');
  const saveDiscordTokenBtn = document.getElementById('save-discord-token-btn');
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

  let syncInterval = null;
  let lastTrackId = null;
  let lastLoggedStatus = null;

  // Load stored configurations
  const storedToken = localStorage.getItem('discord_token');
  if (storedToken) {
    discordTokenInput.value = storedToken;
    updateUserBadge(storedToken);
  }

  const storedOffset = localStorage.getItem('lyric_offset_ms');
  if (storedOffset) {
    offsetInput.value = storedOffset;
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
    appendLog('[DISCORD] Token saved to local browser storage.', 'success');
    await updateUserBadge(token);
    alert('Discord Token saved successfully!');
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
      startLiveSync();
    } else {
      stopLiveSync();
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

  function determineLogType(logText) {
    if (logText.includes('[ERROR]')) return 'error';
    if (logText.includes('[SPOTIFY NOW PLAYING]')) return 'spotify';
    if (logText.includes('[LRCLIB]')) return 'lrclib';
    if (logText.includes('[STATUS BALANCER]')) return 'balancer';
    if (logText.includes('[DISCORD]')) return 'success';
    if (logText.includes('[STATUS RULE]')) return 'warning';
    return 'info';
  }

  async function updateUserBadge(token) {
    try {
      const res = await fetch(`/api/sync?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        userProfileBadge.classList.remove('hidden');
        userNameText.textContent = `Connected User`;
        appendLog(`[DISCORD] Authenticated token successfully!`, 'success');
      } else {
        appendLog(`[ERROR] Invalid Discord Token. Please check your token.`, 'error');
      }
    } catch (e) {
      appendLog(`[ERROR] Token validation error: ${e.message}`, 'error');
    }
  }

  function startLiveSync() {
    syncEngineBadge.textContent = 'RUNNING';
    syncEngineBadge.className = 'badge-status badge-running';

    appendLog('[ENGINE] Starting playback & lyrics sync loop...', 'info');

    performSyncCycle();
    syncInterval = setInterval(performSyncCycle, 1500);
  }

  function stopLiveSync() {
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = null;

    syncEngineBadge.textContent = 'STOPPED';
    syncEngineBadge.className = 'badge-status badge-stopped';
    liveLyricTextEl.textContent = '🎵 Sync paused.';
    appendLog('[ENGINE] Playback & lyrics sync loop stopped.', 'warning');
  }

  async function performSyncCycle() {
    const token = localStorage.getItem('discord_token');
    if (!token) return;

    const offset = offsetInput.value || 0;

    try {
      const res = await fetch(`/api/sync?token=${encodeURIComponent(token)}&offset=${offset}`);
      const data = await res.json();

      // Update UI Status Dot
      if (data.userStatus) {
        updateStatusDot(data.userStatus);
      }

      // Stream Logs to Terminal Box
      if (data.logs && Array.isArray(data.logs)) {
        for (const logLine of data.logs) {
          // Avoid duplicate track/balancer log spamming unless changed
          if (logLine.includes('[STATUS BALANCER]')) {
            if (logLine !== lastLoggedStatus) {
              lastLoggedStatus = logLine;
              appendLog(logLine, 'balancer');
            }
          } else if (logLine.includes('[SPOTIFY NOW PLAYING]')) {
            const trackId = data.track ? data.track.id : null;
            if (trackId !== lastTrackId) {
              lastTrackId = trackId;
              appendLog(logLine, 'spotify');
            }
          } else if (logLine.includes('[LRCLIB]')) {
            appendLog(logLine, 'lrclib');
          } else if (logLine.includes('[ERROR]')) {
            appendLog(logLine, 'error');
          } else if (logLine.includes('[STATUS RULE]')) {
            appendLog(logLine, 'warning');
          }
        }
      }

      // Handle Status Rules
      if (data.isInvisible) {
        liveLyricTextEl.textContent = '⚪ Status is INVISIBLE. Sync paused automatically.';
        trackTitleEl.textContent = 'Status is Invisible';
        trackArtistEl.textContent = 'Switch status to Online/Idle/DND to resume lyrics';
        return;
      }

      if (!data.isPlaying || !data.track) {
        trackTitleEl.textContent = 'No Track Playing';
        trackArtistEl.textContent = 'Play music on Spotify to start lyrics';
        liveLyricTextEl.textContent = '🎵 Waiting for Spotify playback...';
        return;
      }

      trackTitleEl.textContent = data.track.title;
      trackArtistEl.textContent = data.track.artist;

      if (data.currentLyricLine) {
        liveLyricTextEl.textContent = data.currentLyricLine;
      } else {
        liveLyricTextEl.textContent = `🎵 ${data.track.title} - ${data.track.artist}`;
      }
    } catch (err) {
      appendLog(`[ERROR] Network sync error: ${err.message}`, 'error');
    }
  }

  function updateStatusDot(status) {
    userStatusDot.className = 'status-dot';
    if (status === 'online') userStatusDot.classList.add('dot-online');
    else if (status === 'idle') userStatusDot.classList.add('dot-idle');
    else if (status === 'dnd') userStatusDot.classList.add('dot-dnd');
    else userStatusDot.classList.add('dot-invisible');
  }
});
