/**
 * MusiqLock: Radio 24/7 Sincronizada
 * Diseño Panorámico Fullscreen con Fondos Dinámicos de Skylines y Reloj Superior Derecho
 * Comandos de consola incluidos para cambiar hora y fondo
 */

(function () {
  'use strict';

  // Application State
  let streamPlayerA = null;
  let streamPlayerB = null;
  let activePlayerKey = 'A';
  let isPlaying = false;
  let isMuted = false;
  let currentTrack = null;
  let currentPhase = null;
  let simulatedTimeOffset = null; // null = real live time, number = offset in seconds
  let preloadedVideoId = null;
  let isCrossFading = false;
  let crossFadeInterval = null;
  let pendingPlay = false;
  let streamLoadToken = 0;
  const streamCache = Object.create(null);
  const STREAM_API = 'https://ytmp.arielcapdevila.com/api/stream';

  // Auto-hide inmersivo
  let inactivityTimer = null;

  // Vídeos y pósters de ciudades dinámicos por fase circadiana (Sin logos ni marcas de agua)
  const PHASE_VIDEOS = {
    'madrugada': {
      id: 'madrugada',
      video: 'assets/videos/madrugada.mp4',
      poster: 'assets/videos/madrugada.jpg',
      city: 'Nueva York',
      subtitle: 'Bajo Manhattan Nocturno'
    },
    'despertar': {
      id: 'despertar',
      video: 'assets/videos/despertar.mp4',
      poster: 'assets/videos/despertar.jpg',
      city: 'Tokio',
      subtitle: 'Amanecer en Tokyo Skytree'
    },
    'enfoque': {
      id: 'enfoque',
      video: 'assets/videos/enfoque.mp4',
      poster: 'assets/videos/enfoque.jpg',
      city: 'Nueva York',
      subtitle: 'Midtown & Empire State'
    },
    'sobremesa': {
      id: 'sobremesa',
      video: 'assets/videos/sobremesa.mp4',
      poster: 'assets/videos/sobremesa.jpg',
      city: 'Singapur',
      subtitle: 'Marina Bay Sands'
    },
    'dinamismo': {
      id: 'dinamismo',
      video: 'assets/videos/dinamismo.mp4',
      poster: 'assets/videos/dinamismo.jpg',
      city: 'Nueva York',
      subtitle: 'Atardecer Dorado'
    },
    'pulso': {
      id: 'pulso',
      video: 'assets/videos/pulso.mp4',
      poster: 'assets/videos/pulso.jpg',
      city: 'Tokio',
      subtitle: 'Luces de Neón & Autopistas'
    },
    'descenso': {
      id: 'descenso',
      video: 'assets/videos/descenso.mp4',
      poster: 'assets/videos/descenso.jpg',
      city: 'Nueva York',
      subtitle: 'Noche Urbana'
    },
    'cierre_ritual': {
      id: 'cierre_ritual',
      video: 'assets/videos/sydney.mp4',
      poster: 'assets/videos/sydney.jpg',
      city: 'Sídney',
      subtitle: 'Ópera y Bahía a Medianoche'
    }
  };

  const CITY_KEYS = ['madrugada', 'despertar', 'enfoque', 'sobremesa', 'dinamismo', 'pulso', 'descenso', 'cierre_ritual'];
  let currentCityIndex = 0;
  let manualCityOverride = false;
  let wallpaperPlaylistActive = false;
  let wallpaperAdvanceLock = false;
  let activeBgLayer = 'A';
  let currentVideoUrl = '';
  let currentWallpaperUrl = '';
  let lastWallpaperTime = 0;
  let wallpaperStallTicks = 0;
  let wallpaperWatchdogId = null;

  // Muchas teles usan Chrome/Chromium sin "SmartTV" en el UA; el crossfade las congela.
  const ua = navigator.userAgent || '';
  const isTvDevice = /SmartTV|SMART-TV|SmartTv|Tizen|Web0S|WebOS|WEBOS|VIDAA|NetCast|BRAVIA|CrKey|AFT|AppleTV|HbbTV|Opera TV|Hisense|SonyCEBrowser|Viera|PhilipsTV|Maple|Espial|VIZIO|Roku|Chromecast|Android TV|GoogleTV|MiTV|FireTV|Silk\/|Smart.?TV|TV Safari|HbbTV/i.test(ua);
  // Un solo <video> evita el freeze del decoder en casi todas las teles
  const useSingleWallpaper = true;

  // DOM Elements
  const masterClock = document.getElementById('masterClock');
  const masterDate = document.getElementById('masterDate');
  const locationCity = document.getElementById('locationCity');
  const phaseName = document.getElementById('phaseName');

  const trackTitle = document.getElementById('trackTitle');
  const trackArtist = document.getElementById('trackArtist');

  const currentTimeLabel = document.getElementById('currentTimeLabel');
  const totalTimeLabel = document.getElementById('totalTimeLabel');
  const progressFill = document.getElementById('progressFill');

  const btnTuneIn = document.getElementById('btnTuneIn');
  const tuneIcon = document.getElementById('tuneIcon');
  const btnTuneText = document.getElementById('btnTuneText');
  const audioHud = document.getElementById('audioHud');

  const btnMute = document.getElementById('btnMute');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeIcon = document.getElementById('volumeIcon');

  const btnCycleCity = document.getElementById('btnCycleCity');
  const btnToggleSchedule = document.getElementById('btnToggleSchedule');
  const scheduleModal = document.getElementById('scheduleModal');
  const btnCloseSchedule = document.getElementById('btnCloseSchedule');
  const scheduleTabs = document.getElementById('scheduleTabs');
  const scheduleList = document.getElementById('scheduleList');

  const localAudio = document.getElementById('localAudio');
  const videoLayerA = document.getElementById('videoLayerA');
  const videoLayerB = document.getElementById('videoLayerB');
  const wallpaperVideoA = document.getElementById('wallpaperVideoA');
  const wallpaperVideoB = document.getElementById('wallpaperVideoB');
  streamPlayerA = document.getElementById('streamPlayerA');
  streamPlayerB = document.getElementById('streamPlayerB');

  // Format seconds to HH:MM:SS
  function formatTimeHHMMSS(seconds) {
    const s = Math.floor(seconds) % 86400;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  // Format seconds to HH:MM (solo hora y minutos para el modo grande)
  function formatTimeHHMM(seconds) {
    const s = Math.floor(seconds) % 86400;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Format seconds to M:SS
  function formatTimeMSS(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  // Get current continuous broadcast second (0 to 86399.999)
  function getBroadcastSecond() {
    const now = new Date();
    const realSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;
    if (simulatedTimeOffset !== null) {
      return (realSec + simulatedTimeOffset + 86400) % 86400;
    }
    return realSec;
  }

  // Find active track for current second
  function getTrackForSecond(sec) {
    const s = sec % 86400;
    const timeline = RADIO_SCHEDULE.timeline;

    // Special check for midnight ritual (sydney.mp3 starts at 86233.7, ends at 86411.53 / 11.53s)
    const ritualTrack = timeline.find(t => t.isRitual);
    if (ritualTrack) {
      if (s >= ritualTrack.startSec || s < (ritualTrack.endSec % 86400)) {
        return ritualTrack;
      }
    }

    for (let i = 0; i < timeline.length; i++) {
      const t = timeline[i];
      if (!t.isRitual && s >= t.startSec && s < t.endSec) {
        return t;
      }
    }
    return timeline[0];
  }

  // Get phase info
  function getPhaseById(phaseId) {
    return RADIO_SCHEDULE.phases.find(p => p.id === phaseId) || RADIO_SCHEDULE.phases[0];
  }

  function playMedia(el) {
    if (!el) return;
    try {
      el.muted = true;
      el.defaultMuted = true;
      el.volume = 0;
      const playPromise = el.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          setTimeout(() => {
            try {
              el.muted = true;
              el.play().catch(() => {});
            } catch (e2) {}
          }, 250);
        });
      }
    } catch (e) {}
  }

  function prepareWallpaperVideo(el) {
    if (!el) return;
    el.muted = true;
    el.defaultMuted = true;
    el.volume = 0;
    el.autoplay = true;
    el.loop = false;
    el.playsInline = true;
    el.setAttribute('muted', '');
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    el.setAttribute('x5-playsinline', '');
    el.removeAttribute('loop');
  }

  function getActiveWallpaperVideo() {
    if (useSingleWallpaper || isTvDevice) return wallpaperVideoA;
    return activeBgLayer === 'A' ? wallpaperVideoA : wallpaperVideoB;
  }

  function playNextWallpaper() {
    if (wallpaperAdvanceLock) return;
    wallpaperAdvanceLock = true;
    currentCityIndex = (currentCityIndex + 1) % CITY_KEYS.length;
    const nextInfo = PHASE_VIDEOS[CITY_KEYS[currentCityIndex]];
    lastWallpaperTime = 0;
    wallpaperStallTicks = 0;
    setCityVideo(nextInfo);
    setTimeout(() => {
      wallpaperAdvanceLock = false;
    }, 1200);
  }

  function maybeAdvanceWallpaper(el) {
    if (!el || el !== getActiveWallpaperVideo() || wallpaperAdvanceLock) return;
    const dur = el.duration;
    const t = el.currentTime;
    if (el.ended) {
      playNextWallpaper();
      return;
    }
    // En muchas teles `ended` no dispara: avanzar cerca del final
    if (Number.isFinite(dur) && dur > 0 && t >= Math.max(0.2, dur - 0.45)) {
      playNextWallpaper();
    }
  }

  function bindWallpaperSequence(el) {
    if (!el || el.dataset.playlistBound === '1') return;
    el.dataset.playlistBound = '1';
    el.addEventListener('ended', () => {
      if (el === getActiveWallpaperVideo()) playNextWallpaper();
    });
    el.addEventListener('error', () => {
      if (el === getActiveWallpaperVideo()) playNextWallpaper();
    });
    el.addEventListener('timeupdate', () => {
      maybeAdvanceWallpaper(el);
    });
    el.addEventListener('playing', () => {
      wallpaperStallTicks = 0;
    });
    el.addEventListener('stalled', () => {
      if (el === getActiveWallpaperVideo()) playMedia(el);
    });
    el.addEventListener('suspend', () => {
      if (el === getActiveWallpaperVideo() && el.paused && !el.ended) playMedia(el);
    });
  }

  function kickWallpaperPlayback() {
    const el = getActiveWallpaperVideo();
    if (!el || !el.getAttribute('src')) return;
    if (el.ended) {
      playNextWallpaper();
      return;
    }
    const dur = el.duration;
    const t = el.currentTime || 0;
    if (Number.isFinite(dur) && dur > 0 && t >= Math.max(0.2, dur - 0.45)) {
      playNextWallpaper();
      return;
    }
    if (Math.abs(t - lastWallpaperTime) < 0.05) {
      wallpaperStallTicks += 1;
    } else {
      wallpaperStallTicks = 0;
      lastWallpaperTime = t;
    }
    // Congelado en tele: currentTime no avanza aunque diga que reproduce
    if (wallpaperStallTicks >= 2) {
      wallpaperStallTicks = 0;
      try {
        if (t > 0.1 && Number.isFinite(dur) && t < dur - 1) {
          el.currentTime = Math.min(t + 0.01, dur - 0.1);
        } else {
          el.currentTime = 0;
        }
      } catch (e) {}
      playMedia(el);
      // Si sigue congelado tras varios intentos, saltar al siguiente
      if (!el._stallSkips) el._stallSkips = 0;
      el._stallSkips += 1;
      if (el._stallSkips >= 3) {
        el._stallSkips = 0;
        playNextWallpaper();
      }
      return;
    }
    if (el.paused) {
      playMedia(el);
    }
  }

  function youtubeWatchUrl(videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  function parseStreamExpiry(streamUrl) {
    try {
      const expire = new URL(streamUrl).searchParams.get('expire');
      if (expire) return Number(expire) * 1000;
    } catch (e) {}
    return Date.now() + 4 * 60 * 60 * 1000;
  }

  async function resolveStreamUrl(videoId) {
    const cached = streamCache[videoId];
    if (cached && cached.expires > Date.now() + 120000) {
      return cached.url;
    }
    const apiUrl = `${STREAM_API}?url=${encodeURIComponent(youtubeWatchUrl(videoId))}&type=video`;
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error('Stream API ' + res.status);
    const data = await res.json();
    if (!data || !data.url) throw new Error('Stream API vacío');
    streamCache[videoId] = {
      url: data.url,
      expires: parseStreamExpiry(data.url)
    };
    return data.url;
  }

  function loadWallpaperOnElement(videoEl, vUrl, pUrl) {
    if (!videoEl || !vUrl) return;
    prepareWallpaperVideo(videoEl);
    lastWallpaperTime = 0;
    wallpaperStallTicks = 0;
    videoEl._stallSkips = 0;

    const startPlayback = () => {
      try { videoEl.currentTime = 0; } catch (e) {}
      playMedia(videoEl);
    };

    // Evitar race: quitar listeners previos
    videoEl.onloadeddata = null;
    videoEl.oncanplay = null;
    videoEl.onerror = null;

    if (pUrl) videoEl.poster = pUrl;

    try { videoEl.pause(); } catch (e) {}

    // En teles, reasignar src + load() es más fiable que solo cambiar src
    if (videoEl.getAttribute('src') === vUrl) {
      try { videoEl.currentTime = 0; } catch (e) {}
      playMedia(videoEl);
      return;
    }

    videoEl.removeAttribute('src');
    try { videoEl.load(); } catch (e) {}
    videoEl.src = vUrl;
    videoEl.setAttribute('src', vUrl);

    const onReady = () => {
      videoEl.removeEventListener('loadeddata', onReady);
      videoEl.removeEventListener('canplay', onReady);
      startPlayback();
    };
    videoEl.addEventListener('loadeddata', onReady);
    videoEl.addEventListener('canplay', onReady);
    try { videoEl.load(); } catch (e) {}
    // Fallback por si la tele no dispara loadeddata
    setTimeout(() => {
      if (videoEl.paused && videoEl.getAttribute('src') === vUrl) {
        startPlayback();
      }
    }, 600);
  }

  // Un solo <video> activo: el crossfade congela el decoder en muchas Smart TV
  function setCityVideo(videoData) {
    if (!videoData) return;
    const vUrl = typeof videoData === 'string' ? videoData : videoData.video;
    const pUrl = typeof videoData === 'object' ? videoData.poster : '';
    const cityName = typeof videoData === 'object' ? `${videoData.city} • ${videoData.subtitle}` : videoData;
    const videoKey = typeof videoData === 'object' ? videoData.id : '';

    if (cityName && locationCity) {
      locationCity.textContent = cityName;
    }

    if (videoKey) {
      const keyIndex = CITY_KEYS.indexOf(videoKey);
      if (keyIndex >= 0) currentCityIndex = keyIndex;
    }

    if (vUrl === currentVideoUrl) {
      const activeVideo = getActiveWallpaperVideo();
      if (activeVideo && (activeVideo.paused || activeVideo.ended)) {
        if (activeVideo.ended) playNextWallpaper();
        else playMedia(activeVideo);
      }
      return;
    }
    currentVideoUrl = vUrl;
    currentWallpaperUrl = vUrl;
    wallpaperPlaylistActive = true;

    if (!wallpaperVideoA) return;

    loadWallpaperOnElement(wallpaperVideoA, vUrl, pUrl);
    if (videoLayerA) videoLayerA.classList.add('active');
    if (videoLayerB) videoLayerB.classList.remove('active');
    if (wallpaperVideoB) {
      try {
        wallpaperVideoB.pause();
        wallpaperVideoB.removeAttribute('src');
        wallpaperVideoB.load();
      } catch (e) {}
    }
    activeBgLayer = 'A';
  }

  // Compatibilidad hacia atrás para cambiar fondo/vídeo
  function setWallpaper(url) {
    if (!url) return;
    manualCityOverride = true;
    const match = Object.values(PHASE_VIDEOS).find(v => v.video === url || v.poster === url);
    if (match) {
      setCityVideo(match);
    } else {
      setCityVideo({ video: url, poster: '', city: 'Fondo Dinámico', subtitle: 'Personalizado' });
    }
  }

  // Cambiar manualmente de ciudad con el botón
  function cycleCityVideo() {
    manualCityOverride = true;
    currentCityIndex = (currentCityIndex + 1) % CITY_KEYS.length;
    const key = CITY_KEYS[currentCityIndex];
    const vidInfo = PHASE_VIDEOS[key];
    setCityVideo(vidInfo);
    console.log(`%c🌆 Ciudad cambiada a: ${vidInfo.city} (${vidInfo.subtitle})`, 'color: #38bdf8; font-weight: bold;');
  }

  // Apply phase styling & wallpaper
  function applyPhase(phase) {
    if (currentPhase && currentPhase.id === phase.id) return;
    currentPhase = phase;

    document.body.className = `phase-${phase.id}`;
    if (phaseName) phaseName.textContent = phase.name;

    if (!manualCityOverride && !wallpaperPlaylistActive) {
      const vidInfo = PHASE_VIDEOS[phase.id] || PHASE_VIDEOS['dinamismo'];
      setCityVideo(vidInfo);
    }
  }

  // Apply track details
  function applyTrack(track, offset) {
    if (!currentTrack || currentTrack.id !== track.id) {
      currentTrack = track;
      if (trackTitle) trackTitle.textContent = (track.isRitual ? '🎺 ' : '') + track.title;
      if (trackArtist) trackArtist.textContent = track.artist;
      if (totalTimeLabel) totalTimeLabel.textContent = formatTimeMSS(track.duration);
      updateActiveScheduleItem(track.id);

      // Si es el ritual de medianoche, asegurar el vídeo de Sídney
      if (track.isRitual) {
        setCityVideo(PHASE_VIDEOS['cierre_ritual']);
      }

      // Si cambió de pista mientras se está reproduciendo, iniciar con cross-fade si está precargada
      if (isPlaying) {
        if (!track.isLocalAudio && preloadedVideoId === track.videoId && !isCrossFading) {
          performCrossFade(track);
        } else {
          syncActiveAudio(track, offset, true);
        }
      }
    }

    if (currentTimeLabel) currentTimeLabel.textContent = formatTimeMSS(offset);
    if (progressFill) {
      const pct = Math.min(100, Math.max(0, (offset / track.duration) * 100));
      progressFill.style.width = `${pct}%`;
    }
  }

  // Highlight active track in schedule list
  function updateActiveScheduleItem(activeTrackId) {
    document.querySelectorAll('.schedule-item').forEach(el => {
      const isCur = el.dataset.trackId === activeTrackId;
      el.classList.toggle('current', isCur);
      const existingBadge = el.querySelector('.item-badge');
      if (isCur && !existingBadge) {
        const badge = document.createElement('span');
        badge.className = 'item-badge';
        badge.textContent = 'EN DIRECTO';
        el.appendChild(badge);
      } else if (!isCur && existingBadge) {
        existingBadge.remove();
      }
    });
  }

  // Animación de rodillo de números/fecha: sube el número saliente y por debajo sube el siguiente
  function updateRollingText(container, newText) {
    if (!container) return;

    const currentSlots = Array.from(container.children);
    const targetLength = newText.length;

    // Si aún no tiene estructura de slots o cambió la longitud
    if (currentSlots.length !== targetLength) {
      container.innerHTML = '';
      for (let i = 0; i < targetLength; i++) {
        const char = newText[i];
        const isDigit = /\d/.test(char);
        const isSep = char === ':';
        const isSpace = char === ' ';

        const slot = document.createElement('span');
        slot.className = `roll-slot ${isDigit ? 'is-digit' : isSep ? 'is-sep' : isSpace ? 'is-space' : 'is-char'}`;
        slot.dataset.char = char;

        const unit = document.createElement('span');
        unit.className = 'roll-unit roll-current';
        unit.textContent = char;
        slot.appendChild(unit);
        container.appendChild(slot);
      }
      return;
    }

    // Actualizar cada slot
    for (let i = 0; i < targetLength; i++) {
      const slot = currentSlots[i];
      const newChar = newText[i];
      const prevChar = slot.dataset.char;

      if (prevChar === newChar) continue;
      slot.dataset.char = newChar;

      const isDigit = /\d/.test(newChar);
      const isSep = newChar === ':';
      const isSpace = newChar === ' ';
      slot.className = `roll-slot ${isDigit ? 'is-digit' : isSep ? 'is-sep' : isSpace ? 'is-space' : 'is-char'}`;

      if (isSep) {
        slot.innerHTML = `<span class="roll-unit roll-current">${newChar}</span>`;
        continue;
      }

      // Si había transiciones previas acumuladas en este slot, limpiar
      const existingUnits = slot.querySelectorAll('.roll-unit');
      if (existingUnits.length > 1) {
        for (let u = 0; u < existingUnits.length - 1; u++) {
          existingUnits[u].remove();
        }
        existingUnits[existingUnits.length - 1].className = 'roll-unit roll-current';
      }

      const currentUnit = slot.querySelector('.roll-unit') || slot.firstElementChild;
      if (!currentUnit) {
        const unit = document.createElement('span');
        unit.className = 'roll-unit roll-current';
        unit.textContent = newChar;
        slot.appendChild(unit);
        continue;
      }

      // El siguiente número entra desde abajo
      const nextUnit = document.createElement('span');
      nextUnit.className = 'roll-unit roll-next';
      nextUnit.textContent = newChar;
      slot.appendChild(nextUnit);

      // Forzar cálculo de estilo para inicializar translateY(100%)
      void nextUnit.offsetWidth;

      // Animar: sube el actual hacia arriba y por debajo sube el siguiente
      requestAnimationFrame(() => {
        currentUnit.classList.add('animate-out');
        nextUnit.classList.add('animate-in');
      });

      setTimeout(() => {
        if (currentUnit.parentNode === slot) {
          currentUnit.remove();
        }
        nextUnit.classList.remove('roll-next', 'animate-in');
        nextUnit.classList.add('roll-current');
      }, 440);
    }
  }

  // Main Sincronía Loop
  let lastSyncSecond = 0;
  let lastClockValue = '';
  let lastDateValue = '';

  function tick() {
    const sec = getBroadcastSecond();
    const secFloor = Math.floor(sec);

    // Master Clock & Date con animación vertical (sube número y por debajo sube el siguiente)
    // En modo grande (frame-mode), solo se muestran hora y minutos (HH:MM)
    const clockStr = isFrameMode ? formatTimeHHMM(secFloor) : formatTimeHHMMSS(secFloor);
    if (clockStr !== lastClockValue) {
      lastClockValue = clockStr;
      if (masterClock) updateRollingText(masterClock, clockStr);
    }

    if (!isFrameMode) {
      const now = new Date();
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const dateStr = `${now.getDate()} ${months[now.getMonth()]}`;
      if (dateStr !== lastDateValue) {
        lastDateValue = dateStr;
        if (masterDate) updateRollingText(masterDate, dateStr);
      }
    }

    // Current Track & Phase
    const track = getTrackForSecond(sec);
    const phase = getPhaseById(track.phaseId);
    applyPhase(phase);

    // Offset calculation
    let offset = sec - track.startSec;
    if (track.isRitual && sec < track.startSec) {
      offset = (86400 - track.startSec) + sec;
    }
    offset = Math.max(0, offset);
    applyTrack(track, offset);

    // Precarga de la siguiente pista (cuando quedan <= 12s)
    if (isPlaying && !track.isLocalAudio && !isCrossFading) {
      const remainingSec = track.duration - offset;
      if (remainingSec <= 12 && remainingSec > 1) {
        const nextTrack = getTrackForSecond(track.endSec + 0.5);
        if (nextTrack && !nextTrack.isLocalAudio && preloadedVideoId !== nextTrack.videoId) {
          preloadStreamTrack(nextTrack);
        }
      }
    }

    // Sync Audio cada 2 segundos (solo si no estamos en cross-fade)
    if (isPlaying && !isCrossFading) {
      if (Math.abs(secFloor - lastSyncSecond) >= 2) {
        lastSyncSecond = secFloor;
        syncActiveAudio(track, offset);
      }
    }

    requestAnimationFrame(tick);
  }

  // Asignar tiempo de reproducción a localAudio sin romper la carga de metadatos
  function seekLocalAudio(audioEl, targetTime) {
    if (!audioEl) return;
    const safeTime = Math.max(0, Math.min(targetTime, (audioEl.duration || 178) - 0.5));
    if (audioEl.readyState >= 1) {
      try {
        audioEl.currentTime = safeTime;
      } catch (e) {
        console.warn('Error seeking localAudio', e);
      }
    } else {
      audioEl.addEventListener('loadedmetadata', () => {
        try {
          audioEl.currentTime = safeTime;
        } catch (e) {}
      }, { once: true });
    }
  }

  // Funciones de control de reproductor dual (Player A & Player B)
  function getActivePlayer() {
    return activePlayerKey === 'A' ? streamPlayerA : streamPlayerB;
  }

  function getInactivePlayer() {
    return activePlayerKey === 'A' ? streamPlayerB : streamPlayerA;
  }

  function isCurrentPlayerReady() {
    return !!getActivePlayer();
  }

  function pauseStreamPlayer(el) {
    if (!el) return;
    try {
      el.pause();
      el.volume = 0;
    } catch (e) {}
  }

  function seekMedia(el, targetTime) {
    if (!el) return;
    const duration = el.duration;
    const safeTime = Number.isFinite(duration) && duration > 0
      ? Math.max(0, Math.min(targetTime, duration - 0.25))
      : Math.max(0, targetTime);
    const apply = () => {
      try { el.currentTime = safeTime; } catch (e) {}
    };
    if (el.readyState >= 1) {
      apply();
    } else {
      el.addEventListener('loadedmetadata', apply, { once: true });
    }
  }

  // Curva de Atenuación Perceptual (Ley de Stevens ~ x^2.2 - Audio Taper)
  // Corrige la percepción humana: en valores bajos ofrece ajuste fino y gradual (sin saltos bruscos),
  // y en valores altos expande la dinámica perceptible para que cada subida tenga pegada.
  function getAudioVolume(sliderVal) {
    const raw = Number(sliderVal);
    if (isNaN(raw) || raw <= 0) return { yt: 0, html5: 0 };
    if (raw >= 100) return { yt: 100, html5: 1 };
    const norm = raw / 100;
    const curved = Math.pow(norm, 2.2);
    return {
      yt: Math.round(curved * 100),
      html5: curved
    };
  }

  function getCurrentAudioGain() {
    if (isMuted) return { yt: 0, html5: 0 };
    const val = volumeSlider ? volumeSlider.value : 85;
    return getAudioVolume(val);
  }

  // Cross-fade suave de volumen entre reproductores A y B (2.5s) con curva de potencia constante
  function performCrossFade(incomingTrack) {
    const activeP = getActivePlayer();
    const inactiveP = getInactivePlayer();
    const targetVol = getCurrentAudioGain().html5;

    if (!inactiveP || inactiveP.dataset.videoId !== incomingTrack.videoId) {
      syncActiveAudio(incomingTrack, 0, true);
      return;
    }

    isCrossFading = true;
    const fadeDurationMs = 2500;
    const startTime = performance.now();

    try {
      inactiveP.muted = isMuted;
      inactiveP.volume = 0;
      inactiveP.play().catch(() => {});
    } catch (e) {}

    clearInterval(crossFadeInterval);
    crossFadeInterval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1, elapsed / fadeDurationMs);

      // Curva Equal-Power (seno/coseno): mantiene la energía acústica total sin caída en el centro
      const inVol = targetVol * Math.sin(progress * (Math.PI / 2));
      const outVol = targetVol * Math.cos(progress * (Math.PI / 2));

      try { inactiveP.volume = inVol; } catch (e) {}
      try { activeP.volume = outVol; } catch (e) {}

      if (progress >= 1) {
        clearInterval(crossFadeInterval);
        pauseStreamPlayer(activeP);
        try { inactiveP.volume = targetVol; } catch (e) {}
        activePlayerKey = activePlayerKey === 'A' ? 'B' : 'A';
        preloadedVideoId = null;
        isCrossFading = false;
      }
    }, 50);
  }

  async function preloadStreamTrack(track) {
    const inactiveP = getInactivePlayer();
    if (!inactiveP || !track || !track.videoId) return;
    preloadedVideoId = track.videoId;
    try {
      const url = await resolveStreamUrl(track.videoId);
      if (preloadedVideoId !== track.videoId) return;
      inactiveP.volume = 0;
      inactiveP.muted = true;
      inactiveP.src = url;
      inactiveP.dataset.videoId = track.videoId;
      inactiveP.load();
      const onMeta = () => {
        seekMedia(inactiveP, 0);
        if (isPlaying) {
          inactiveP.play().catch(() => {});
        }
      };
      if (inactiveP.readyState >= 1) onMeta();
      else inactiveP.addEventListener('loadedmetadata', onMeta, { once: true });
    } catch (e) {
      preloadedVideoId = null;
      console.warn('Preload failed', e);
    }
  }

  async function loadStreamOnPlayer(player, track, offset) {
    if (!player || !track || !track.videoId) return;
    const token = ++streamLoadToken;
    const targetVol = getCurrentAudioGain().html5;
    player.dataset.videoId = track.videoId;
    try {
      const url = await resolveStreamUrl(track.videoId);
      if (token !== streamLoadToken || !isPlaying) return;
      if (!currentTrack || currentTrack.videoId !== track.videoId) return;
      player.src = url;
      player.dataset.videoId = track.videoId;
      player.muted = isMuted;
      player.volume = targetVol;
      player.load();
      const start = () => {
        if (token !== streamLoadToken) return;
        seekMedia(player, offset);
        player.muted = isMuted;
        player.volume = targetVol;
        if (isPlaying) {
          player.play().catch(e => console.warn('stream play prevented', e));
        }
      };
      if (player.readyState >= 1) start();
      else player.addEventListener('loadedmetadata', start, { once: true });
    } catch (e) {
      console.warn('No se pudo resolver el stream', e);
      if (token === streamLoadToken && isPlaying) {
        const sec = getBroadcastSecond();
        const fallback = getTrackForSecond(sec + 20);
        if (fallback && fallback.videoId !== track.videoId && !fallback.isLocalAudio) {
          syncActiveAudio(fallback, 0, true);
        }
      }
    }
  }

  // Synchronize either stream player or localAudio (sydney.mp3)
  function syncActiveAudio(track, offset, forceSeek = false) {
    if (isCrossFading) return;

    if (track.isLocalAudio) {
      pauseStreamPlayer(streamPlayerA);
      pauseStreamPlayer(streamPlayerB);

      if (localAudio) {
        localAudio.volume = getCurrentAudioGain().html5;
        localAudio.muted = isMuted;
        if (forceSeek) {
          seekLocalAudio(localAudio, offset);
        }
        if (localAudio.paused) {
          if (!forceSeek) {
            seekLocalAudio(localAudio, offset);
          }
          localAudio.play().catch(e => console.warn('localAudio play prevented', e));
        }
      }
    } else {
      if (localAudio && !localAudio.paused) {
        localAudio.pause();
        localAudio.currentTime = 0;
      }

      const activeP = getActivePlayer();
      if (!activeP) return;

      const currentLoadedId = activeP.dataset.videoId;
      const targetVol = getCurrentAudioGain().html5;

      if (currentLoadedId !== track.videoId) {
        loadStreamOnPlayer(activeP, track, offset);
        return;
      }

      activeP.muted = isMuted;
      activeP.volume = targetVol;
      const playerTime = Number.isFinite(activeP.currentTime) ? activeP.currentTime : 0;
      const drift = Math.abs(playerTime - offset);
      if (forceSeek || drift > 2.5) {
        seekMedia(activeP, offset);
      }
      if (isPlaying && activeP.paused) {
        activeP.play().catch(e => console.warn('stream play prevented', e));
      }
    }
  }

  function setupStreamPlayers() {
    [streamPlayerA, streamPlayerB].forEach((player) => {
      if (!player || player.dataset.bound === '1') return;
      player.dataset.bound = '1';
      player.addEventListener('playing', () => {
        if (player === getActivePlayer() && isPlaying) {
          setPlaybackState(true);
        }
      });
      player.addEventListener('error', () => {
        const videoId = player.dataset.videoId;
        if (!videoId || !isPlaying || player !== getActivePlayer()) return;
        delete streamCache[videoId];
        const retries = Number(player.dataset.retries || 0);
        if (retries >= 2) return;
        player.dataset.retries = String(retries + 1);
        const sec = getBroadcastSecond();
        const track = getTrackForSecond(sec);
        let offset = sec - track.startSec;
        if (track.isRitual && sec < track.startSec) {
          offset = (86400 - track.startSec) + sec;
        }
        offset = Math.max(0, offset);
        if (track && track.videoId === videoId) {
          player.dataset.videoId = '';
          loadStreamOnPlayer(player, track, offset);
        }
      });
      player.addEventListener('loadeddata', () => {
        player.dataset.retries = '0';
      });
    });
  }

  function setPlaybackState(playing) {
    isPlaying = playing;
    if (audioHud) {
      audioHud.classList.toggle('is-tuned', playing);
    }
    if (playing) {
      if (btnTuneIn) btnTuneIn.classList.add('active');
      if (tuneIcon) tuneIcon.textContent = '❚❚';
      if (btnTuneText) btnTuneText.textContent = 'En Vivo';
    } else {
      if (btnTuneIn) btnTuneIn.classList.remove('active');
      if (tuneIcon) tuneIcon.textContent = '▶';
      if (btnTuneText) btnTuneText.textContent = 'Sintonizar';
    }
  }

  function resumeWallpaperPlayback() {
    kickWallpaperPlayback();
  }

  function applyStreamVolume() {
    const gain = getCurrentAudioGain();
    if (localAudio) {
      localAudio.muted = isMuted;
      localAudio.volume = gain.html5;
    }
    const activeP = getActivePlayer();
    if (activeP && !isCrossFading) {
      activeP.muted = isMuted;
      activeP.volume = gain.html5;
    }
  }

  // Tune In / Pause Toggle Button
  if (btnTuneIn) {
    btnTuneIn.addEventListener('click', () => {
      resumeWallpaperPlayback();
      if (isPlaying) {
        pendingPlay = false;
        setPlaybackState(false);
        if (localAudio) localAudio.pause();
        pauseStreamPlayer(streamPlayerA);
        pauseStreamPlayer(streamPlayerB);
      } else {
        setPlaybackState(true);
        const sec = getBroadcastSecond();
        const track = getTrackForSecond(sec);
        let offset = sec - track.startSec;
        if (track.isRitual && sec < track.startSec) {
          offset = (86400 - track.startSec) + sec;
        }
        offset = Math.max(0, offset);

        if (track.isLocalAudio) {
          if (localAudio) {
            seekLocalAudio(localAudio, offset);
            localAudio.muted = isMuted;
            localAudio.volume = getCurrentAudioGain().html5;
            localAudio.play().catch(e => console.warn('Local play prevented', e));
          }
        } else {
          const activeP = getActivePlayer();
          if (activeP) {
            syncActiveAudio(track, offset, true);
          } else {
            pendingPlay = true;
            if (btnTuneText) btnTuneText.textContent = 'Sintonizando...';
          }
        }
      }
    });
  }

  function updateVolumeSliderFill(val) {
    if (!volumeSlider) return;
    const currentVal = val !== undefined ? val : parseInt(volumeSlider.value, 10);
    const pct = isMuted ? 0 : currentVal;
    volumeSlider.style.background = `linear-gradient(to right, #ffffff 0%, #ffffff ${pct}%, rgba(255, 255, 255, 0.22) ${pct}%, rgba(255, 255, 255, 0.22) 100%)`;
  }

  // Volume & Mute Controls
  if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (val === 0) {
        isMuted = true;
        updateVolumeIcon(true);
      } else if (isMuted) {
        isMuted = false;
        updateVolumeIcon(false);
      }
      applyStreamVolume();
      updateVolumeSliderFill(val);
    });
  }

  if (btnMute) {
    btnMute.addEventListener('click', () => {
      isMuted = !isMuted;
      applyStreamVolume();
      updateVolumeIcon(isMuted);
      updateVolumeSliderFill();
    });
  }

  function updateVolumeIcon(muted) {
    if (!volumeIcon) return;
    if (muted) {
      volumeIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>';
    } else {
      volumeIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>';
    }
  }

  // Parrilla Modal Management
  if (btnToggleSchedule && scheduleModal) {
    btnToggleSchedule.addEventListener('click', () => {
      scheduleModal.classList.add('active');
      document.body.classList.remove('zen-mode');
      clearTimeout(inactivityTimer);
      setTimeout(() => {
        const activeEl = scheduleList ? scheduleList.querySelector('.schedule-item.current') : null;
        if (activeEl) {
          activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    });
  }

  if (btnCloseSchedule && scheduleModal) {
    btnCloseSchedule.addEventListener('click', () => {
      scheduleModal.classList.remove('active');
      resetInactivity();
    });
  }

  if (scheduleModal) {
    scheduleModal.addEventListener('click', (e) => {
      if (e.target === scheduleModal) {
        scheduleModal.classList.remove('active');
        resetInactivity();
      }
    });
  }

  // ==========================================================================
  // MODO CUADRO DIGITAL (Pantalla Completa + Reloj Centrado + UI Limpia)
  // ==========================================================================
  let isFrameMode = false;
  let toastTimer = null;

  function showFrameToast(text) {
    const toast = document.getElementById('frameToast');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  function toggleFrameMode(forceState) {
    if (typeof forceState === 'boolean') {
      isFrameMode = forceState;
    } else {
      isFrameMode = !isFrameMode;
    }

    document.body.classList.toggle('frame-mode', isFrameMode);
    lastClockValue = '';
    lastDateValue = '';

    if (isFrameMode) {
      if (scheduleModal && scheduleModal.classList.contains('active')) {
        scheduleModal.classList.remove('active');
      }
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } catch (e) {}
      showFrameToast('Modo Cuadro Digital • Pulsa F o Esc para salir');
      console.log('%c🖼️ Modo Cuadro Digital activado (Reloj centrado en pantalla)', 'color: #38bdf8; font-weight: bold;');
    } else {
      try {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      } catch (e) {}
      showFrameToast('Modo Estándar restaurado');
      console.log('%c🖼️ Modo Cuadro Digital desactivado', 'color: #9ca3af;');
    }
  }

  // Sincronizar salida de pantalla completa nativa (Escape, F11, gestos)
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isFrameMode) {
      isFrameMode = false;
      document.body.classList.remove('frame-mode');
      lastClockValue = '';
      lastDateValue = '';
      showFrameToast('Modo Estándar restaurado');
    }
  });

  const btnToggleFrame = document.getElementById('btnToggleFrame');
  if (btnToggleFrame) {
    btnToggleFrame.addEventListener('click', () => toggleFrameMode());
  }

  // Atajos de teclado intuitivos
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (btnTuneIn) btnTuneIn.click();
    } else if (e.code === 'KeyM') {
      e.preventDefault();
      if (btnMute) btnMute.click();
    } else if (e.code === 'KeyF') {
      e.preventDefault();
      toggleFrameMode();
    } else if (e.code === 'Escape') {
      if (scheduleModal && scheduleModal.classList.contains('active')) {
        scheduleModal.classList.remove('active');
        resetInactivity();
      } else if (isFrameMode) {
        toggleFrameMode(false);
      }
    }
  });

  // Modo Inmersivo Automático (Auto-hide / Zen Mode tras 5 segundos de inactividad)
  function resetInactivity() {
    document.body.classList.remove('zen-mode');
    document.body.classList.add('mouse-active');
    clearTimeout(inactivityTimer);

    if (scheduleModal && scheduleModal.classList.contains('active')) {
      return;
    }

    inactivityTimer = setTimeout(() => {
      document.body.classList.remove('mouse-active');
      document.body.classList.add('zen-mode');
    }, 4500);
  }

  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'].forEach(evt => {
    window.addEventListener(evt, resetInactivity, { passive: true });
  });
  resetInactivity();


  // Render Tabs and Track List for Parrilla 24h
  function initSchedule() {
    const phases = RADIO_SCHEDULE.phases;
    scheduleTabs.innerHTML = `
      <button class="tab-btn active" data-filter="all">Todas las 24h</button>
      ${phases.map(p => `<button class="tab-btn" data-filter="${p.id}">${p.name}</button>`).join('')}
    `;

    scheduleTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderScheduleList(btn.dataset.filter);
    });

    renderScheduleList('all');
  }

  function renderScheduleList(filter) {
    const timeline = RADIO_SCHEDULE.timeline;
    const filtered = filter === 'all' ? timeline : timeline.filter(t => t.phaseId === filter);

    scheduleList.innerHTML = filtered.map(t => {
      const isCur = currentTrack && currentTrack.id === t.id;
      const startStr = formatTimeHHMMSS(t.startSec).slice(0, 5);
      const endStr = formatTimeHHMMSS(t.endSec).slice(0, 5);

      return `
        <div class="schedule-item ${isCur ? 'current' : ''}" data-track-id="${t.id}" data-start-sec="${t.startSec}" style="cursor: pointer;">
          <div class="item-time">${startStr} — ${endStr}</div>
          <div class="item-info">
            <div class="item-title">${t.isRitual ? '🎺 ' : ''}${t.title}</div>
            <div class="item-artist">${t.artist}</div>
          </div>
          ${isCur ? '<span class="item-badge">EN DIRECTO</span>' : ''}
        </div>
      `;
    }).join('');

    // Clic en cualquier elemento para sintonizar esa canción
    scheduleList.querySelectorAll('.schedule-item').forEach(item => {
      item.addEventListener('click', () => {
        const startSec = parseFloat(item.dataset.startSec);
        if (!isNaN(startSec)) {
          setTime(startSec);
          if (!isPlaying && btnTuneIn) {
            btnTuneIn.click();
          }
          if (scheduleModal) {
            scheduleModal.classList.remove('active');
          }
        }
      });
    });
  }

  // ==========================================================================
  // COMANDOS DE CONSOLA DEL NAVEGADOR
  // ==========================================================================

  function parseTargetSecond(arg1, arg2, arg3) {
    if (arg1 === undefined || arg1 === null) return null;

    if (typeof arg1 === 'string') {
      const str = arg1.trim();
      // Soporta "HH:MM:SS", "HH:MM", "HH MM SS", etc.
      const parts = str.split(/[:\s]+/).map(p => parseFloat(p)).filter(n => !isNaN(n));
      if (parts.length >= 2) {
        const h = parts[0];
        const m = parts[1];
        const s = parts.length >= 3 ? parts[2] : 0;
        return (((h * 3600 + m * 60 + s) % 86400) + 86400) % 86400;
      } else if (parts.length === 1) {
        const val = parts[0];
        if (val > 24) {
          return ((val % 86400) + 86400) % 86400;
        }
        return (((val * 3600) % 86400) + 86400) % 86400;
      }
      return null;
    }

    if (typeof arg1 === 'number') {
      if (arg2 === undefined && arg3 === undefined) {
        if (arg1 > 24) {
          return ((arg1 % 86400) + 86400) % 86400;
        }
        return (((arg1 * 3600) % 86400) + 86400) % 86400;
      }
      const h = Number(arg1) || 0;
      const m = Number(arg2) || 0;
      const s = Number(arg3) || 0;
      return (((h * 3600 + m * 60 + s) % 86400) + 86400) % 86400;
    }

    return null;
  }

  function setTime(arg1, arg2, arg3) {
    if (arg1 === undefined || arg1 === null) {
      const cur = formatTimeHHMMSS(getBroadcastSecond());
      console.log(`⏰ Hora actual: ${cur}`);
      console.log(`💡 Uso: sthora("HH:MM:SS") o sthora(H, M, S) o sthora("HH:MM")`);
      return cur;
    }

    const targetSec = parseTargetSecond(arg1, arg2, arg3);
    if (targetSec === null) {
      console.error('❌ Formato no válido. Usa: sthora("HH:MM:SS") o sthora(H, M, S) o setHora("23:57:14")');
      return;
    }

    const now = new Date();
    const realSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;
    simulatedTimeOffset = targetSec - realSec;

    const sec = getBroadcastSecond();
    const track = getTrackForSecond(sec);
    const phase = getPhaseById(track.phaseId);
    applyPhase(phase);

    let offset = sec - track.startSec;
    if (track.isRitual && sec < track.startSec) {
      offset = (86400 - track.startSec) + sec;
    }
    offset = Math.max(0, offset);

    // Al usar sthora / setHora, activar la sintonización para que la música empiece inmediatamente
    setPlaybackState(true);

    applyTrack(track, offset);
    syncActiveAudio(track, offset, true);

    const formattedTime = formatTimeHHMMSS(sec);
    console.log(`%c⏰ Hora sincronizada a ${formattedTime}`, 'color: #10b981; font-weight: bold; font-size: 13px;');
    console.log(`🎶 Tema activo: "${track.title}" — ${track.artist} (${formatTimeMSS(offset)} / ${formatTimeMSS(track.duration)})`);
    console.log(`🌆 Fondo activo: ${currentVideoUrl || currentWallpaperUrl}`);
    if (track.isRitual) {
      const leftForTrumpet = Math.max(0, 166.3 - offset);
      console.log(`🎺 Cierre Ritual activo con "My City of Sydney" (YouTube: eNcY6jfbO7s). La trompeta sonará a medianoche (en ${leftForTrumpet.toFixed(1)} segundos)`);
    }
    console.log(`💡 Para volver a la hora real, escribe: resetTime() o live()`);
    return formattedTime;
  }

  function resetTime() {
    simulatedTimeOffset = null;
    const sec = getBroadcastSecond();
    const track = getTrackForSecond(sec);
    const phase = getPhaseById(track.phaseId);
    applyPhase(phase);

    let offset = sec - track.startSec;
    if (track.isRitual && sec < track.startSec) {
      offset = (86400 - track.startSec) + sec;
    }
    offset = Math.max(0, offset);
    applyTrack(track, offset);
    if (isPlaying) {
      syncActiveAudio(track, offset, true);
    }
    console.log(`%c⚡ Vuelto a la hora real en directo (${formatTimeHHMMSS(sec)})`, 'color: #ef4444; font-weight: bold; font-size: 13px;');
    return formatTimeHHMMSS(sec);
  }

  function getTime() {
    const sec = getBroadcastSecond();
    const track = getTrackForSecond(sec);
    let offset = sec - track.startSec;
    if (track.isRitual && sec < track.startSec) {
      offset = (86400 - track.startSec) + sec;
    }
    const isSimulated = simulatedTimeOffset !== null;
    console.log(`⏰ Hora actual: ${formatTimeHHMMSS(sec)} ${isSimulated ? '(Hora ajustada)' : '(En directo sincronizado)'}`);
    console.log(`🎶 Canción: "${track.title}" — ${track.artist} [${formatTimeMSS(offset)} / ${formatTimeMSS(track.duration)}]`);
    console.log(`🌌 Fase circadiana: ${track.phaseName}`);
    console.log(`🌆 Fondo actual: ${currentVideoUrl || currentWallpaperUrl}`);
    return {
      time: formatTimeHHMMSS(sec),
      isSimulated,
      track: track.title,
      artist: track.artist,
      phase: track.phaseName,
      video: currentVideoUrl
    };
  }

  // Comandos de consola para cambiar y listar ciudades
  function setCity(cityNameOrKey) {
    if (!cityNameOrKey) {
      listCities();
      return;
    }
    const query = String(cityNameOrKey).toLowerCase().trim();
    const keyMatch = Object.keys(PHASE_VIDEOS).find(k => k.toLowerCase() === query);
    if (keyMatch) {
      manualCityOverride = true;
      setCityVideo(PHASE_VIDEOS[keyMatch]);
      return PHASE_VIDEOS[keyMatch];
    }
    const cityMatch = Object.values(PHASE_VIDEOS).find(v => 
      v.city.toLowerCase().includes(query) || v.subtitle.toLowerCase().includes(query)
    );
    if (cityMatch) {
      manualCityOverride = true;
      setCityVideo(cityMatch);
      return cityMatch;
    }
    console.warn(`Ciudad "${cityNameOrKey}" no encontrada. Usa ciudades() para ver la lista.`);
    listCities();
  }

  function resetCity() {
    manualCityOverride = false;
    const sec = getBroadcastSecond();
    const track = getTrackForSecond(sec);
    const phase = getPhaseById(track.phaseId);
    if (track.isRitual) {
      setCityVideo(PHASE_VIDEOS['cierre_ritual']);
    } else {
      setCityVideo(PHASE_VIDEOS[phase.id] || PHASE_VIDEOS['dinamismo']);
    }
    console.log('%c⚡ Ciudad restaurada a modo sincronizado con la fase', 'color: #10b981; font-weight: bold;');
  }

  function listCities() {
    console.log('%c🌆 Ciudades y Vídeos Panorámicos Disponibles:', 'color: #f59e0b; font-weight: bold; font-size: 13px;');
    console.table(Object.values(PHASE_VIDEOS).map(v => ({
      Fase: v.id,
      Ciudad: v.city,
      Panorámica: v.subtitle,
      Ruta: v.video
    })));
    console.log('Usa setCity("tokio"), setCity("sidney"), setCity("singapur") o setCity("nueva york") para cambiar.');
  }

  // Exportar a window
  window.setTime = setTime;
  window.setHora = setTime;
  window.sthora = setTime;
  window.sethora = setTime;
  window.stHora = setTime;
  window.hora = setTime;
  window.resetTime = resetTime;
  window.horaReal = resetTime;
  window.live = resetTime;
  window.getTime = getTime;
  window.verHora = getTime;
  window.setWallpaper = setWallpaper;
  window.cambiarFondo = setWallpaper;
  window.setCity = setCity;
  window.cambiarCiudad = setCity;
  window.resetCity = resetCity;
  window.ciudadAutomatica = resetCity;
  window.setVideo = setCity;
  window.cambiarVideo = setCity;
  window.ciudades = listCities;
  window.listCities = listCities;
  window.cuadroDigital = toggleFrameMode;
  window.frameMode = toggleFrameMode;
  window.toggleFullscreen = toggleFrameMode;

  // Initialize Station
  function init() {
    document.body.classList.add('tv-safe');
    if (isTvDevice) document.body.classList.add('is-tv');

    setupStreamPlayers();
    prepareWallpaperVideo(wallpaperVideoA);
    prepareWallpaperVideo(wallpaperVideoB);
    bindWallpaperSequence(wallpaperVideoA);
    bindWallpaperSequence(wallpaperVideoB);

    // Preload sydney.mp3 y gestionar finalización limpia hacia La Madrugada
    if (localAudio) {
      localAudio.load();
      localAudio.addEventListener('ended', () => {
        const sec = getBroadcastSecond();
        const track = getTrackForSecond(sec);
        if (!track.isLocalAudio && isPlaying) {
          let offset = sec - track.startSec;
          if (track.isRitual && sec < track.startSec) {
            offset = (86400 - track.startSec) + sec;
          }
          offset = Math.max(0, offset);
          syncActiveAudio(track, offset, true);
        }
      });
    }

    // Botón para ciclar de ciudad
    if (btnCycleCity) {
      btnCycleCity.addEventListener('click', cycleCityVideo);
    }

    // Cargar el primer vídeo de la fase actual y encadenar el resto al terminar
    const initialSec = getBroadcastSecond();
    const initialTrack = getTrackForSecond(initialSec);
    const initialPhase = getPhaseById(initialTrack.phaseId);
    const initialVid = initialTrack.isRitual ? PHASE_VIDEOS['cierre_ritual'] : (PHASE_VIDEOS[initialPhase.id] || PHASE_VIDEOS['dinamismo']);
    setCityVideo(initialVid);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        resumeWallpaperPlayback();
      }
    });
    ['click', 'touchstart', 'keydown', 'pointerdown'].forEach((evt) => {
      window.addEventListener(evt, resumeWallpaperPlayback, { passive: true });
    });

    // Watchdog agresivo: teles congelan el frame sin marcar paused/ended
    if (wallpaperWatchdogId) clearInterval(wallpaperWatchdogId);
    wallpaperWatchdogId = setInterval(kickWallpaperPlayback, 1500);

    updateVolumeSliderFill();
    initSchedule();
    setPlaybackState(false);
    requestAnimationFrame(tick);

    if (new URLSearchParams(window.location.search).has('frame')) {
      toggleFrameMode(true);
    }

    console.log(
      '%c📻 MusiqLock Radio 24/7 Sincronizada con Vídeos de Ciudades\n' +
      '%cComandos de consola disponibles:\n' +
      '  • sthora("23:57:14") o sthora(23, 57, 14)   -> Cambia y sincroniza música y reloj exacto\n' +
      '  • setHora("14:30:00") o setTime(14, 30, 0)  -> Sincronizar a cualquier hora/minuto/segundo\n' +
      '  • setCity("tokio") o cambiarCiudad("sydney") -> Cambiar skyline en vídeo\n' +
      '  • ciudades()                                -> Ver todas las ciudades disponibles\n' +
      '  • resetCity()                               -> Ciudad automática según la hora\n' +
      '  • resetTime() o horaReal()                  -> Volver al directo en tiempo real\n' +
      '  • getTime() o verHora()                     -> Ver estado, canción y hora actual',
      'color: #6366f1; font-weight: bold; font-size: 14px;',
      'color: #9ca3af; font-size: 12px; line-height: 1.5;'
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
