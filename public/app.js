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
  let currentLyrics = null;
  let currentTrackId = null;
  let lastStatusText = null;
  let selfUserId = null;

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

  async function updateUserBadge(token) {
    try {
      const res = await fetch('https://discord.com/api/v9/users/@me', {
        headers: { Authorization: token },
      });
      if (res.ok) {
        const data = await res.json();
        selfUserId = data.id;
        userProfileBadge.classList.remove('hidden');
        userNameText.textContent = `${data.username}`;
        appendLog(`[DISCORD] Authenticated as ${data.username} (${data.id})`, 'success');
      } else {
        appendLog(`[ERROR] Invalid Discord Token (HTTP ${res.status}). Please check your token.`, 'error');
      }
    } catch (e) {
      appendLog(`[ERROR] Network error validating Discord Token: ${e.message}`, 'error');
    }
  }

  function startLiveSync() {
    syncEngineBadge.textContent = 'RUNNING';
    syncEngineBadge.className = 'badge-status badge-running';

    appendLog('[ENGINE] Starting playback & lyrics sync loop...', 'info');

    performSyncCycle();
    syncInterval = setInterval(performSyncCycle, 1200);
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

    try {
      // 1. Get Self User ID if missing
      if (!selfUserId) {
        const meRes = await fetch('https://discord.com/api/v9/users/@me', { headers: { Authorization: token } });
        if (!meRes.ok) {
          appendLog(`[ERROR] Failed to fetch @me (HTTP ${meRes.status}). Invalid token?`, 'error');
          return;
        }
        const meData = await meRes.json();
        selfUserId = meData.id;
      }

      // 2. Fetch User Profile & Spotify Activities directly from client browser
      const profileRes = await fetch(`https://discord.com/api/v9/users/${selfUserId}/profile`, {
        headers: { Authorization: token },
      });

      if (!profileRes.ok) {
        appendLog(`[ERROR] Profile fetch returned HTTP ${profileRes.status}`, 'error');
        return;
      }

      const data = await profileRes.json();
      const activities = data.activities || data.user_profile?.activities || [];
      const userStatus = data.user_profile?.status || data.status || 'online';

      updateStatusDot(userStatus);

      // 3. STATUS RULE: Allow online, idle, dnd. Disable if INVISIBLE/OFFLINE
      if (userStatus === 'invisible' || userStatus === 'offline') {
        liveLyricTextEl.textContent = '⚪ Status is INVISIBLE. Sync paused automatically.';
        trackTitleEl.textContent = 'Status is Invisible';
        trackArtistEl.textContent = 'Switch status to Online/Idle/DND to resume lyrics';
        if (lastStatusText !== '__INVISIBLE__') {
          lastStatusText = '__INVISIBLE__';
          appendLog(`[STATUS RULE] User is INVISIBLE/OFFLINE [Status: ${userStatus}]. Skipping status updates.`, 'warning');
        }
        return;
      }

      // 4. Find Spotify Activity
      const spotifyAct = activities.find(
        (a) => a.name === 'Spotify' || a.type === 2 || (a.party && a.party.id && a.party.id.startsWith('spotify:'))
      );

      if (!spotifyAct || !spotifyAct.details) {
        trackTitleEl.textContent = 'No Track Playing';
        trackArtistEl.textContent = 'Play music on Spotify to start lyrics';
        liveLyricTextEl.textContent = '🎵 Waiting for Spotify playback...';
        currentTrackId = null;
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

      // 5. Track Change Logging & Lyrics Fetching
      if (currentTrackId !== track.id) {
        currentTrackId = track.id;
        appendLog(`[SPOTIFY NOW PLAYING] ${track.title} - ${track.artist}`, 'spotify');

        currentLyrics = await fetchLyricsFromLRCLIB(track);
        if (currentLyrics && currentLyrics.length > 0) {
          appendLog(`[LRCLIB] Found ${currentLyrics.length} synced lyric lines.`, 'lrclib');
        } else {
          appendLog(`[LRCLIB] No synced lyrics found for this track.`, 'warning');
        }
      }

      // 6. Find Active Lyric Line
      const offsetMs = parseInt(offsetInput.value || '0', 10);
      const activeLine = getActiveLyricLine(currentLyrics, progressMs, offsetMs);

      const lyricText = activeLine ? activeLine.text : `🎵 ${track.title}`;
      const formattedStatus = `🎵 | ${lyricText}`.substring(0, 128);

      liveLyricTextEl.textContent = formattedStatus;

      // 7. Apply Status Update to Discord if changed
      if (formattedStatus !== lastStatusText) {
        lastStatusText = formattedStatus;

        await fetch('https://discord.com/api/v9/users/@me/settings', {
          method: 'PATCH',
          headers: {
            Authorization: token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            custom_status: { text: formattedStatus },
          }),
        });

        appendLog(`[STATUS BALANCER] Updated status: "${formattedStatus}"`, 'balancer');
      }
    } catch (err) {
      appendLog(`[ERROR] ${err.message}`, 'error');
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
