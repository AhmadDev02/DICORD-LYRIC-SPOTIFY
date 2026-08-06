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

  const trackTitleEl = document.getElementById('track-title');
  const trackArtistEl = document.getElementById('track-artist');
  const liveLyricTextEl = document.getElementById('live-lyric-text');

  let syncInterval = null;
  let currentLyrics = null;
  let currentTrackId = null;
  let lastProgressMs = 0;
  let lastFetchTime = 0;

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

  saveDiscordTokenBtn.addEventListener('click', () => {
    const token = discordTokenInput.value.trim();
    if (!token) {
      alert('Please enter a valid Discord User Token.');
      return;
    }
    localStorage.setItem('discord_token', token);
    updateUserBadge(token);
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
  });

  async function updateUserBadge(token) {
    try {
      const res = await fetch('https://discord.com/api/v9/users/@me', {
        headers: { Authorization: token },
      });
      if (res.ok) {
        const data = await res.json();
        userProfileBadge.classList.remove('hidden');
        userNameText.textContent = `${data.username}`;
      }
    } catch (e) {}
  }

  function startLiveSync() {
    syncEngineBadge.textContent = 'RUNNING';
    syncEngineBadge.className = 'badge-status badge-running';

    performSyncCycle();
    syncInterval = setInterval(performSyncCycle, 1500);
  }

  function stopLiveSync() {
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = null;

    syncEngineBadge.textContent = 'STOPPED';
    syncEngineBadge.className = 'badge-status badge-stopped';
    liveLyricTextEl.textContent = '🎵 Sync paused.';
  }

  async function performSyncCycle() {
    const token = localStorage.getItem('discord_token');
    if (!token) return;

    try {
      const res = await fetch(`/api/sync?token=${encodeURIComponent(token)}&offset=${offsetInput.value || 0}`);
      if (!res.ok) return;

      const data = await res.json();

      // Check User Status Rules
      if (data.userStatus) {
        updateStatusDot(data.userStatus);
      }

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
      console.error('Sync error:', err);
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
