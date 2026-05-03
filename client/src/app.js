
let currentRadios = []
let playingRadio = null // { id, name, logo, stream, page, indexOnPage }
let currentPage = 1
const limitPerPage = 10;
let searchQuery = "";
let showFavoritesOnly = false;
let favorites = JSON.parse(localStorage.getItem('radioFavorites') || '[]')

let audio = new Audio()
audio.crossOrigin = "anonymous";
let hls = null
let isPlaying = false
let connectionTimeout = null;

// Audio Normalizer Nodes
let audioCtx = null;
let source = null;
let compressor = null;
let analyser = null;
let dataArray = null;
let peakData = []; // To store falling caps
let particles = []; // To store persistent floating particles
let animationId = null;

function initAudioGraph() {
  if (audioCtx) return; // Already initialized
  
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    source = audioCtx.createMediaElementSource(audio);
    compressor = audioCtx.createDynamicsCompressor();
    
    // Default Compressor Settings for Normalization
    // Threshold: Level at which compression starts
    compressor.threshold.setValueAtTime(-24, audioCtx.currentTime);
    // Knee: Softness of the transition
    compressor.knee.setValueAtTime(30, audioCtx.currentTime);
    // Ratio: Amount of compression (higher = flatter)
    compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
    // Attack: How fast it reacts to peaks
    compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
    // Release: How fast it returns to normal
    compressor.release.setValueAtTime(0.25, audioCtx.currentTime);
    
    // Setup Analyser for Visualizer
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
    
    updateNormalizerState();
    startVisualizer();
  } catch (e) {
    console.error("Web Audio API not supported or failed:", e);
  }
}

function updateNormalizerState() {
  if (!audioCtx || !source || !compressor) return;
  
  try {
    // Disconnect everything first to be safe
    source.disconnect();
    compressor.disconnect();
    
    if (appSettings.normalizer) {
      // Route: Source -> Analyser -> Compressor -> Destination
      source.connect(analyser);
      analyser.connect(compressor);
      compressor.connect(audioCtx.destination);
    } else {
      // Route: Source -> Analyser -> Destination (Visualizer still works, but no compression)
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
    }
  } catch(err) {
    console.warn("Failed to update normalizer state:", err);
  }
}
const fallbackImage = 'public/icon-128.png'
let fallbackBase64 = null


// Pre-load fallback icon as Base64 for Windows SMTC
async function prepareFallback() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      fallbackBase64 = canvas.toDataURL('image/png');
      resolve();
    };
    img.onerror = () => resolve();
    img.src = fallbackImage;
  });
}
prepareFallback();

async function getAsDataURL(url) {
  if (!url) return fallbackBase64;
  if (url.startsWith('data:')) return url;
  
  try {
    const bytes = await window.__TAURI__.core.invoke('proxy_get', { url });
    if (bytes) {
      let type = 'image/png';
      if (url.toLowerCase().includes('.jpg') || url.toLowerCase().includes('.jpeg')) type = 'image/jpeg';
      else if (url.toLowerCase().includes('.webp')) type = 'image/webp';
      
      // Memory-safe way to convert large Uint8Array to base64
      const uint8 = new Uint8Array(bytes);
      let binary = '';
      const chunk = 8192;
      for (let i = 0; i < uint8.length; i += chunk) {
        binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunk));
      }
      const base64 = btoa(binary);
      return `data:${type};base64,${base64}`;
    }
  } catch (e) {
    console.warn("Proxy image fetch failed", e);
  }
  return fallbackBase64;
}

// Geolocation & Fallback logic continues...


// TRAY TOOLTIP ANIMATION
let trayStaticTitle = "Arch Radio";
let trayScrollingPart = "";
let trayMarqueeOffset = 0;
let trayMarqueeTimer = null;
const TRAY_LIMIT = 25; 

function updateTrayMarquee(staticTitle, scrollingPart) {
  if (trayMarqueeTimer) clearInterval(trayMarqueeTimer);
  trayStaticTitle = staticTitle.length > TRAY_LIMIT ? staticTitle.substring(0, TRAY_LIMIT-3) + "..." : staticTitle;
  const baseText = ` • ${scrollingPart} • `;
  const paddedText = baseText + " ".repeat(TRAY_LIMIT) + baseText;
  trayMarqueeOffset = 0;
  trayMarqueeTimer = setInterval(() => {
    if (!isPlaying) return;
    trayMarqueeOffset++;
    if (trayMarqueeOffset >= baseText.length + TRAY_LIMIT) trayMarqueeOffset = 0;
    const scrolledSubtitle = paddedText.substring(trayMarqueeOffset, trayMarqueeOffset + TRAY_LIMIT);
    window.__TAURI__.core.invoke('update_tray_tooltip', { title: `${trayStaticTitle}\n${scrolledSubtitle}` });
  }, 400);
}

// DYNAMIC ACCENT COLOR


function startVisualizer() {
  const canvas = document.getElementById("visualizer");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  
  function draw() {
    animationId = requestAnimationFrame(draw);
    if (!isPlaying || !dataArray) return;
    
    analyser.getByteFrequencyData(dataArray);
    
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // --- BEAT PULSE EFFECT ON IMAGE ---
    const nowImgEl = document.getElementById('nowImg');
    // Only use the first 4 bins for TRUE sub-bass detection
    let bassSum = 0;
    for(let i=0; i<4; i++) bassSum += dataArray[i];
    const avgBass = bassSum / (4 * 255.0);
    
    if (nowImgEl) {
      // Threshold: only pulse if bass is strong enough ( > 0.4 )
      const threshold = 0.4;
      let pulseValue = 0;
      if (avgBass > threshold) {
        // Calculate how much it exceeds the threshold and use power to make it punchy
        pulseValue = Math.pow((avgBass - threshold) / (1.0 - threshold), 1.5);
      }
      
      const imgScale = 1.0 - (pulseValue * 0.12); // Back to 12% for a cleaner look
      nowImgEl.style.setProperty('transform', `scale(${imgScale})`, 'important');
    }

    const bassValue = avgBass;

    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#3b82f6';
    const sliceWidth = canvas.width / (dataArray.length / 2);

    // --- LAYER 1: GLOWING PORTAL (OVERLAPPING IMAGE) ---
    ctx.save();
    const imgEl = nowImg;
    let centerX = canvas.width / 2;
    let centerY = (canvas.height / 2) - 100;
    
    if (imgEl) {
      const rect = imgEl.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      centerX = (rect.left + rect.width / 2) - canvasRect.left;
      centerY = (rect.top + rect.height / 2) - canvasRect.top;
    }

    const outerRadius = 110; 
    const innerBaseRadius = 105; // Slightly larger to overlap the 100px radius image
    
    // Set glow effect
    ctx.shadowBlur = 20;
    ctx.shadowColor = accentColor;
    ctx.globalAlpha = 1.0;
    
    // Draw the main portal ring
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2, false);
    
    // Inner wavy edge (overlapping the image)
    for (let i = 0; i < dataArray.length / 2; i++) {
      const v = dataArray[i] / 255.0;
      const angle = (i / (dataArray.length / 4)) * Math.PI;
      // Overlap: the wave goes from 105 down to 70 (well inside the image)
      const r = innerBaseRadius - (v * 45); 
      const tx = centerX + Math.cos(-angle) * r;
      const ty = centerY + Math.sin(-angle) * r;
      if (i === 0) ctx.lineTo(tx, ty);
      else ctx.lineTo(tx, ty);
    }
    
    for (let i = (dataArray.length / 2) - 1; i >= 0; i--) {
      const v = dataArray[i] / 255.0;
      const angle = - (i / (dataArray.length / 4)) * Math.PI;
      const r = innerBaseRadius - (v * 45);
      const tx = centerX + Math.cos(-angle) * r;
      const ty = centerY + Math.sin(-angle) * r;
      ctx.lineTo(tx, ty);
    }
    ctx.closePath();
    
    // Fill with transparency to see the logo
    ctx.globalAlpha = 0.1; 
    ctx.fillStyle = accentColor;
    ctx.fill();
    
    // Draw a sharper glowing stroke for the edge
    ctx.globalAlpha = 0;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 0;
    ctx.stroke();

    // --- ADD PERSISTENT PARTICLES (Smooth Mesh Effect) ---
    ctx.shadowBlur = 0;
    
    // Initialize particles if empty
    if (particles.length === 0) {
      for (let i = 0; i < 300; i++) {
        particles.push({
          angle: Math.random() * Math.PI * 2,
          distance: innerBaseRadius - Math.random() * 25,
          size: 0.2 + Math.random() * 0.6,
          speed: (Math.random() * 0.01) - 0.005, // Random direction and speed
          scatterMult: 0.5 + Math.random() * 1.5 // Individual explosion power
        });
      }
    }

    // Draw and Update Particles
    ctx.fillStyle = '#ffffff';
    
    // Use pulseValue for the "flash and snap" effect
    const pThreshold = 0.65; // Even tighter threshold
    const pPulse = (avgBass > pThreshold) ? Math.pow((avgBass - pThreshold) / (1.0 - pThreshold), 2.0) : 0;

    particles.forEach(p => {
      // Update position: rotate with its own speed
      p.angle += p.speed;
      
      // ORGANIC EXPLOSION LOGIC: 
      // Individual scatter multipliers + random noise for a "splash" look
      const scatter = pPulse * 12 * p.scatterMult; // Reduced to 12px for much tighter look
      const noise = pPulse * (Math.random() * 4 - 2); // Smoother noise
      const currentR = p.distance + scatter + noise;
      
      const tx = centerX + Math.cos(p.angle) * currentR;
      const ty = centerY + Math.sin(p.angle) * currentR;
      
      // FLASH LOGIC:
      ctx.globalAlpha = 0.01 + (pPulse * 0.8 * (0.5 + p.scatterMult/2)); 
      
      const sizePulse = p.size + (pPulse * 1.2 * p.scatterMult);
      
      ctx.beginPath();
      ctx.arc(tx, ty, sizePulse, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();

    // --- LAYER 2: THIN BARS & PEAK CAPS (FOREGROUND) ---
    ctx.save();
    x = 0;
    const barSpacing = 2;
    const barWidth = sliceWidth - barSpacing;
    
    const barGradient = ctx.createLinearGradient(0, canvas.height * 0.5, 0, canvas.height);
    barGradient.addColorStop(0, '#ffffff'); // Bright tip
    barGradient.addColorStop(0.1, accentColor); // Solid color near top
    barGradient.addColorStop(0.6, 'rgba(0,0,0,0)'); // Fade out early
    ctx.fillStyle = barGradient;

    // Initialize peaks if not set
    if (peakData.length !== dataArray.length / 2) {
      peakData = new Array(Math.floor(dataArray.length / 2)).fill(0);
    }

    for (let i = 0; i < dataArray.length / 2; i++) {
      const v = dataArray[i] / 255.0;
      const barHeight = v * canvas.height * 0.45; 
      
      // Calculate Peak (Falling Cap)
      if (barHeight > peakData[i]) {
        peakData[i] = barHeight;
      } else {
        peakData[i] -= 0.5; 
        if (peakData[i] < 0) peakData[i] = 0;
      }

      if (barHeight > 0) {
        // Create a LOCAL gradient for each bar for perfect fading
        const localGradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        localGradient.addColorStop(0, '#ffffff'); // White tip
        localGradient.addColorStop(0.3, accentColor); // Accent color near top
        localGradient.addColorStop(1, 'rgba(0,0,0,0)'); // Total transparency at bottom
        
        ctx.fillStyle = localGradient;
        ctx.globalAlpha = 0.8; // Semi-transparent overall
        
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(x, canvas.height - barHeight, barWidth, barHeight, [2, 2, 0, 0]);
          ctx.fill();
        } else {
          ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        }
      }

      // Draw the Peak Cap (Falling Cap)
      if (peakData[i] > 0) {
        // Make the peak cap more visible with a distinct color or white
        ctx.fillStyle = '#ffffff'; // Solid white for maximum contrast
        ctx.globalAlpha = 0.9;
        
        // Draw the cap slightly above the bar
        ctx.fillRect(x, canvas.height - peakData[i] - 2, barWidth, 2);
        
        // Optional: Add a small glow to the peak cap
        ctx.shadowBlur = 4;
        ctx.shadowColor = accentColor;
        ctx.fillRect(x, canvas.height - peakData[i] - 2, barWidth, 2);
        ctx.shadowBlur = 0; // Reset shadow
      }

      x += sliceWidth;
    }
    ctx.restore();
  }
  draw();
}

function toggleNormalizer(enable) {
  initAudioContext();
  if (enable) {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    // Normalizer logic is always in chain now, but we can adjust threshold if disabled
    compressor.threshold.setValueAtTime(-24, audioCtx.currentTime);
  } else {
    // Effectively disable by setting threshold very high
    if (compressor) compressor.threshold.setValueAtTime(0, audioCtx.currentTime);
  }
}

// SLEEP TIMER LOGIC
let sleepTimer = null;
let sleepEndTime = null;

function toggleSleepDropdown(e) {
  if (e) e.stopPropagation();
  const options = document.getElementById("sleepOptions");
  
  // Close city dropdown if open
  const cityOptions = document.getElementById("cityOptions");
  if (cityOptions) cityOptions.classList.remove("show");
  
  options.classList.toggle("show");
}


function selectSleep(value, label) {
  document.getElementById("selectedSleepLabel").innerText = label;
  document.getElementById("sleepOptions").classList.remove("show");
  
  appSettings.sleep = value;
  updateSettings();
}



// Close dropdowns on outside click
document.addEventListener('click', () => {
  const sleepOptions = document.getElementById("sleepOptions");
  const cityOptions = document.getElementById("cityOptions");
  if (sleepOptions) sleepOptions.classList.remove("show");
  if (cityOptions) cityOptions.classList.remove("show");
});


function startSleepTimer(minutes) {

  if (sleepTimer) clearInterval(sleepTimer);
  if (minutes <= 0) {
    document.getElementById("sleepDisplay").style.display = "none";
    return;
  }
  
  sleepEndTime = Date.now() + minutes * 60 * 1000;
  document.getElementById("sleepDisplay").style.display = "block";
  
  sleepTimer = setInterval(() => {
    const remaining = sleepEndTime - Date.now();
    if (remaining <= 0) {
      clearInterval(sleepTimer);
      if (window.windowControls) window.windowControls.close();
    } else {
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      document.getElementById("sleepDisplay").innerText = `Sleep in ${m}m ${s}s`;
    }
  }, 1000);
}

// DYNAMIC ACCENT COLOR
async function updateAccentColor(imgUrl) {
  if (!imgUrl || imgUrl === fallbackImage) {
    document.documentElement.style.setProperty('--primary-color', '#3b82f6');
    return;
  }
  
  try {
    // Use Rust proxy to bypass CORS
    const bytes = await window.__TAURI__.core.invoke('proxy_get', { url: imgUrl });
    const blob = new Blob([new Uint8Array(bytes)]);
    const blobUrl = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 1;
      canvas.height = 1;
      ctx.drawImage(img, 0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      
      // Calculate brightness
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      let finalR = r, finalG = g, finalB = b;
      
      if (brightness < 60) {
        // Too dark, brighten it up
        finalR = Math.min(255, r + 120);
        finalG = Math.min(255, g + 120);
        finalB = Math.min(255, b + 120);
      } else if (brightness > 180) {
        // Too bright for white text, darken it significantly
        // We target a maximum brightness of around 160-170
        const factor = 160 / brightness;
        finalR = Math.floor(r * factor);
        finalG = Math.floor(g * factor);
        finalB = Math.floor(b * factor);
      }
      
      document.documentElement.style.setProperty('--primary-color', `rgb(${finalR}, ${finalG}, ${finalB})`);
      URL.revokeObjectURL(blobUrl);
    };
    img.src = blobUrl;
  } catch (e) {
    console.error("Failed to extract color via proxy:", e);
    document.documentElement.style.setProperty('--primary-color', '#3b82f6');
  }
}
// Restore volume from local storage
audio.volume = parseFloat(localStorage.getItem('radioVolume') || '1')
document.getElementById('volSlider').value = audio.volume

// Settings Management
let appSettings = JSON.parse(localStorage.getItem('radioSettings') || '{"tray":true,"startup":false,"onTop":true,"normalizer":false,"sleep":0}')

// Tauri Initialization
window.windowControls = {
  minimize: async () => {
    toggleCompactMode(true);
  },
  close: async () => {
    try {
      if (appSettings.tray) {
        await window.__TAURI__.window.getCurrentWindow().hide();
      } else {
        await window.__TAURI__.window.getCurrentWindow().close();
      }
    } catch(e){}
  },
  applySettings: async (settings) => {
    try {
      if (window.__TAURI__) {
        const win = window.__TAURI__.window.getCurrentWindow();
        await win.setAlwaysOnTop(settings.onTop);
        
        if (settings.startup) {
          await window.__TAURI__.core.invoke('plugin:autostart|enable');
        } else {
          await window.__TAURI__.core.invoke('plugin:autostart|disable');
        }
        console.log("App settings applied successfully:", settings);
      }
    } catch(e) {
      console.error("Failed to apply window settings:", e);
    }
  },
  checkUpdates: async () => {
    if (!window.__TAURI__ || !window.__TAURI__.updater) return;
    const btn = document.getElementById("checkUpdateBtn");
    if (!btn) return;
    const originalText = "Check for Updates";
    
    try {
      btn.innerText = "Checking...";
      btn.disabled = true;
      
      const update = await window.__TAURI__.updater.check();
      if (update) {
        // Detect if portable mode
        let isPortable = false;
        try {
          isPortable = await window.__TAURI__.core.invoke('is_portable');
        } catch(err) { console.warn("Failed to detect portable mode:", err); }

        btn.innerText = isPortable ? "Download Versioned" : "Update Now";
        btn.style.background = "var(--primary-color)";
        btn.style.color = "white";
        btn.disabled = false;
        
        // Show custom modal instead of native confirm()
        showUpdateModal(update, isPortable);
      } else {
        btn.innerText = "Latest Version";
        btn.style.background = "rgba(74, 222, 128, 0.2)"; // Soft green
        btn.style.color = "#4ade80";
        setTimeout(() => {
          btn.innerText = "Check for Updates";
          btn.disabled = false;
          btn.style.background = "";
          btn.style.color = "";
        }, 3000);
      }
    } catch (e) {
      console.error("Update check failed:", e);
      btn.innerText = "Check Failed";
      setTimeout(() => {
        btn.innerText = originalText;
        btn.disabled = false;
      }, 3000);
    }
  }
};

function applySettingsState() {

  const settings = appSettings;
  
  if(document.getElementById("settingTray")) document.getElementById("settingTray").checked = settings.tray;
  if(document.getElementById("settingAOT")) document.getElementById("settingAOT").checked = settings.onTop;
  if(document.getElementById("settingNormalizer")) document.getElementById("settingNormalizer").checked = settings.normalizer;
  
  // Update Sleep Dropdown Label
  const sleepLabels = {0: 'Off', 15: '15m', 30: '30m', 60: '60m', 90: '90m', 120: '120m'};
  if(document.getElementById("selectedSleepLabel")) {
    document.getElementById("selectedSleepLabel").innerText = sleepLabels[settings.sleep] || 'Off';
  }

  updateNormalizerState();

  startSleepTimer(settings.sleep || 0);
  
  // Call Rust to synchronize Always on Top state
  if (window.__TAURI__) {
    window.__TAURI__.core.invoke('set_always_on_top', { 
      enabled: settings.onTop 
    }).catch(console.error);
  }
}

function updateSettings() {
  appSettings = {
    tray: document.getElementById("settingTray").checked,
    onTop: document.getElementById("settingAOT").checked,
    normalizer: document.getElementById("settingNormalizer").checked,
    sleep: appSettings.sleep // Kept from selectSleep
  };

  
  localStorage.setItem('radioSettings', JSON.stringify(appSettings));
  
  // Apply to window
  applySettingsState();
  showToast("Settings saved!");
}


function toggleSettings() {
  document.getElementById("settingsOverlay").classList.toggle("active");
}

let _pendingUpdate = null;
async function showUpdateModal(update, isPortable = false) {
  _pendingUpdate = update;
  
  // Make sure settings is open if we are showing the modal
  if (!document.getElementById("settingsOverlay").classList.contains("active")) {
    toggleSettings();
  }

  document.getElementById("updateModalVersion").innerText = `Version ${update.version} is available`;
  document.getElementById("updateModalNotes").innerText = update.body || 'Bug fixes and improvements.';
  
  const installBtn = document.getElementById("updateModalInstallBtn");
  
  if (isPortable) {
    installBtn.innerText = "Update Portable";
    installBtn.disabled = false;
    installBtn.onclick = async () => {
      try {
        installBtn.innerText = "Downloading...";
        installBtn.disabled = true;
        
        // Fetch latest.json manually to get portable_url
        // Using a cache-busting timestamp
        const response = await fetch('https://github.com/khoirulaksara/archradio/releases/latest/download/latest.json?t=' + Date.now());
        const data = await response.json();
        
        if (data.portable_url) {
          const filename = `Arch-Radio-v${update.version}-Portable.exe`;
          await window.__TAURI__.core.invoke('download_portable', { 
            url: data.portable_url,
            filename: filename
          });
          
          installBtn.innerText = "Downloaded!";
          showToast(`Portable saved to same folder!`);
          
          // Display instruction in notes
          document.getElementById("updateModalNotes").innerText = `New version downloaded as: ${filename}\n\nPlease close this application and run the new version.`;
        } else {
          throw new Error("Portable URL not found in metadata");
        }
      } catch (e) {
        console.error("Portable download failed:", e);
        installBtn.innerText = "Download Failed";
        installBtn.disabled = false;
        showToast("Download failed. Please try again or update manually.");
      }
    };
  } else {
    installBtn.innerText = "Install & Relaunch";
    installBtn.disabled = false;
    installBtn.onclick = async () => {
      installBtn.innerText = "Installing...";
      installBtn.disabled = true;
      await _pendingUpdate.downloadAndInstall();
    };
  }
  
  document.getElementById("updateModalBackdrop").classList.add("active");
}

async function checkUpdatesSilently() {
  if (!window.__TAURI__ || !window.__TAURI__.updater) return;
  try {
    const update = await window.__TAURI__.updater.check();
    if (update) {
      document.getElementById("updateBadge").classList.add("active");
      const btn = document.getElementById("checkUpdateBtn");
      if (btn) btn.innerText = "Update Available!";
    }
  } catch (e) {
    console.warn("Silent update check failed:", e);
  }
}

async function updateAppVersion() {
  if (!window.__TAURI__ || !window.__TAURI__.app) return;
  try {
    const version = await window.__TAURI__.app.getVersion();
    const display = document.getElementById("appVersionDisplay");
    if (display) display.innerText = `Version ${version} (Tauri)`;
  } catch (e) {
    console.warn("Failed to get app version:", e);
  }
}

function restoreLastPlayed() {
  const saved = localStorage.getItem('lastPlayedRadio');
  if (saved) {
    try {
      const radio = JSON.parse(saved);
      playingRadio = radio;
      isPlaying = false; // Start in paused state
      updatePlayerUI();
      // Note: We don't set audio.src yet to avoid unnecessary loading
    } catch (e) {
      console.warn("Failed to restore last played:", e);
    }
  }
}

function closeUpdateModal() {
  document.getElementById("updateModalBackdrop").classList.remove("active");
  _pendingUpdate = null;
}

const playIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke-width="0" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>'
const pauseIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke-width="0" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>'

function toggleExpandPlayer(e) {
  // Restore if in compact mode
  if (document.body.classList.contains('compact-mode')) {
    toggleCompactMode(false);
    return;
  }

  // Ignore clicks on buttons/inputs EXCEPT the collapse button
  if (e && e.target.closest('button') || e && e.target.closest('input')) {
    if (!e.target.closest('#collapseBtn')) {
      return;
    }
  }
  
  const player = document.getElementById("mainPlayer");
  player.classList.toggle("expanded");
  if (e) e.stopPropagation();
}

let isCompact = false;

async function toggleCompactMode(enabled) {
  isCompact = enabled; // Update global state
  if (enabled) {

    document.body.classList.add('compact-mode');
    // Force collapse expanded player when entering widget mode
    const player = document.getElementById("mainPlayer");
    if (player && player.classList.contains("expanded")) {
      player.classList.remove("expanded");
      const bg = document.getElementById("expandedBg");
      if (bg) bg.style.backgroundImage = "none";
    }
  } else {
    document.body.classList.remove('compact-mode');
  }
  
  // Call the native Rust window management
  try {
    // Invoke the Rust function we just fixed
    await window.__TAURI__.core.invoke('set_widget_mode', { enabled: enabled });
    
    // If returning to normal mode, call applySettingsState again 
    // to restore Always on Top status based on user preference
    if (!enabled) {
      setTimeout(() => {
        applySettingsState();
      }, 300);
    }
  } catch (err) {
    console.error("Failed to invoke set_widget_mode", err);
  }
}





function toggleSearch() {
  const container = document.getElementById("searchContainer");
  container.classList.toggle("active");
  if (container.classList.contains("active")) {
    document.getElementById("searchInput").focus();
  }
}

function toggleFavoritesMode() {
  showFavoritesOnly = !showFavoritesOnly;
  const btn = document.getElementById("favToggleBtn");
  if (showFavoritesOnly) {
    btn.classList.add('active-fav');
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>';
  } else {
    btn.classList.remove('active-fav');
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>';
  }
  currentPage = 1;
  load(currentPage);
}

function isFavorite(id) {
  return favorites.some(f => f.id === id);
}

function toggleFavorite(e, radioData) {
  if (e) e.stopPropagation(); // prevent playing when clicking heart
  if (isFavorite(radioData.id)) {
    favorites = favorites.filter(f => f.id !== radioData.id);
  } else {
    favorites.push(radioData);
  }
  localStorage.setItem('radioFavorites', JSON.stringify(favorites));
  
  if (showFavoritesOnly) {
    load(currentPage); // refresh list if we removed item
  } else {
    renderPage(); // just update icons
  }
  updatePlayerUI(); // update heart in player
}

function toggleFavoriteCurrent(e) {
  if (playingRadio) {
    toggleFavorite(e, playingRadio);
  }
}

let searchTimeout = null;
function handleSearch(e) {
  const clearBtn = document.getElementById("clearSearchBtn");
  if (clearBtn) clearBtn.style.display = e.target.value ? "flex" : "none";

  if (e.key === "Enter") {
    clearTimeout(searchTimeout);
    executeSearch(e.target.value);
  } else {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      executeSearch(e.target.value);
    }, 600);
  }
}

function clearSearch() {
  const input = document.getElementById("searchInput");
  input.value = "";
  const clearBtn = document.getElementById("clearSearchBtn");
  if (clearBtn) clearBtn.style.display = "none";
  executeSearch("");
  input.focus();
}

async function executeSearch(query) {
  searchQuery = query;
  currentPage = 1;
  await load(currentPage);
}

// Simple in-memory cache for API responses
const apiCache = {};
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes cache
const stationStatus = JSON.parse(localStorage.getItem('stationStatus') || '{}'); // { id: 1 (online), 0 (offline) }
let allStations = []; 
let currentSort = "name";
let currentCity = "";
let isManualCity = false;
let userCoords = null;
let citiesLoaded = false;

function toggleCityDropdown(e) {
  if (e) e.stopPropagation();

  const options = document.getElementById("cityOptions");
  
  // Close sleep dropdown if open
  const sleepOptions = document.getElementById("sleepOptions");
  if (sleepOptions) sleepOptions.classList.remove("show");
  
  const isShowing = options.classList.toggle("show");
  
  if (isShowing) {
    // Focus search input automatically
    setTimeout(() => {
      const input = document.getElementById("citySearchInput");
      if (input) {
        input.value = ""; // Clear previous search
        input.focus();
        // Trigger empty filter to show all
        filterCities({ target: input });
      }
    }, 100);
  }

  // Lazy load cities only once
  if (!citiesLoaded) {
    loadCities();
  }
}


function filterCities(e) {
  const q = e.target.value.toLowerCase();
  const options = document.querySelectorAll("#cityOptions .option");
  options.forEach(opt => {
    const text = opt.innerText.toLowerCase();
    if (text.includes(q) || q === "") {
      opt.style.display = "flex";
    } else {
      opt.style.display = "none";
    }
  });
}

async function loadCities() {
  const options = document.getElementById("cityOptions");
  // Keep the search box and default option
  options.innerHTML = `
    <div class="dropdown-search-box">
      <input type="text" id="citySearchInput" placeholder="Find city..." onkeyup="filterCities(event)" onclick="event.stopPropagation()" autocomplete="off" spellcheck="false">
    </div>

    <div class="option" onclick="selectCity('', 'All Cities')">All Cities</div>
  `;
  
  const loading = document.createElement("div");
  loading.className = "loading-option";
  loading.innerText = "Loading cities...";
  options.appendChild(loading);

  try {
    const res = await window.__TAURI__.core.invoke('get_cities');
    loading.remove();
    
    // Extract cities from data field if it exists, otherwise use res itself
    const citiesData = res.data || res;

    if (citiesData && typeof citiesData === 'object' && !Array.isArray(citiesData)) {
      const cityEntries = Object.entries(citiesData);
      
      if (cityEntries.length > 0) {
        // Sort by station count (descending)
        cityEntries.sort((a, b) => {
          const countA = Array.isArray(a[1]) ? a[1].length : 0;
          const countB = Array.isArray(b[1]) ? b[1].length : 0;
          return countB - countA;
        }).forEach(([cityName, stations]) => {
          if (cityName && cityName !== "undefined" && cityName !== "meta") {
            const count = Array.isArray(stations) ? stations.length : 0;
            const displayCityName = cityName === "Unknown" ? "Other" : cityName;
            const div = document.createElement("div");
            div.className = "option";
            div.onclick = () => selectCity(cityName, displayCityName);
            div.innerHTML = `<span>${displayCityName}</span><span style="opacity:0.5; font-size:11px; font-weight:600">${count}</span>`;
            div.style.display = "flex";
            div.style.justifyContent = "space-between";
            options.appendChild(div);
          }

        });
        citiesLoaded = true;
        return;
      }
    }

    // Fallback for array structure if it ever changes back
    const cities = res.data || (Array.isArray(res) ? res : []);
    if (cities.length > 0) {
      cities.forEach(item => {
        let cityName = typeof item === 'string' ? item : (item.city || item.name || item.group || item.key);
        let count = item.count || (Array.isArray(item.stations) ? item.stations.length : 0);
        if (cityName) {
          const displayCityName = cityName === "Unknown" ? "Other" : cityName;
          const div = document.createElement("div");
          div.className = "option";
          div.onclick = () => selectCity(cityName, displayCityName);
          div.innerHTML = `<span>${displayCityName}</span><span style="opacity:0.5; font-size:10px">(${count})</span>`;
          div.style.display = "flex";
          div.style.justifyContent = "space-between";
          options.appendChild(div);
        }
      });
      citiesLoaded = true;
    }
  } catch (e) {
    loading.innerText = "Failed to load cities";
    console.error("Failed to load cities", e);
  }
}

function selectCity(city, label) {
  currentCity = city;
  isManualCity = true;
  document.getElementById("selectedCityLabel").innerText = label;
  document.getElementById("cityOptions").classList.remove("show");
  currentPage = 1;
  load(1);
}

async function detectLocationByIP() {
  try {
    const data = await window.__TAURI__.core.invoke('detect_ip_location');
    if (data && data.city && !currentCity) {
      currentCity = data.city;
      isManualCity = true;
      const label = document.getElementById('selectedCityLabel');
      if (label) label.innerText = data.city;
      console.log(`Auto-detected city: ${data.city}`);
      return true;
    }
  } catch (e) {
    console.warn("IP Location detection failed", e);
  }
  return false;
}

async function initGeolocation() {
  // 1. Try to detect by IP first (fastest)
  await detectLocationByIP();
  
  // 2. Load the state (either detected city or default)
  load(1);

  // 3. Try real GPS using native plugin (more professional prompt)
  try {
    if (window.__TAURI__ && window.__TAURI__.geolocation) {
      const pos = await window.__TAURI__.geolocation.getCurrentPosition();
      if (pos && pos.coords) {
        userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        // Only reload if we haven't selected a city manually
        if (!currentCity) load(1);
      }
    }
  } catch (err) {
    console.warn("Native GPS failed or denied", err);
  }
}

// Close dropdown when clicking outside
window.addEventListener('click', (e) => {
  const dropdown = document.getElementById('cityDropdown');
  if (dropdown && !dropdown.contains(e.target)) {
    const options = document.getElementById('cityOptions');
    if (options) options.classList.remove('show');
  }
});

let isLoadingStations = false;

async function fetchFromAPI(page, limit, query = "") {
  let params = `page=${page}&limit=${limit}`;
  if (query) params += `&q=${encodeURIComponent(query)}`;
  if (currentCity) {
    // If city is "Unknown", we pass an empty string to the API to fetch stations without a city
    const apiCity = currentCity === "Unknown" ? "" : currentCity;
    params += `&city=${encodeURIComponent(apiCity)}`;
  }
  if (currentSort) params += `&sort=${currentSort}`;
  
  if (userCoords && !query && !currentCity && !isManualCity) {
    params += `&lat=${userCoords.lat}&lng=${userCoords.lng}&radius=100`;
  }

  // Safety timeout for invoke
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error("Request timeout (20s)")), 20000)
  );

  try {
    console.log("Invoking get_indonesia_stations with params:", params);
    const invokePromise = window.__TAURI__.core.invoke('get_indonesia_stations', { params });
    const res = await Promise.race([invokePromise, timeoutPromise]);
    return res;
  } catch (err) {
    console.error("Backend fetch failed:", err);
    throw err;
  }
}

async function load(page) {
  if (isLoadingStations) return;
  isLoadingStations = true;

  const listEl = document.getElementById("list");
  if (!listEl) { 
    isLoadingStations = false; 
    return; 
  }

  listEl.innerHTML = `
    <div class="loader-container">
      <div class="premium-loader"></div>
      <div style="font-size:12px; opacity:0.6; margin-top:10px">Loading stations...</div>
    </div>`;
  
  try {
    if (showFavoritesOnly) {
      const filtered = searchQuery 
        ? favorites.filter(f => f && f.name && f.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : favorites;
      
      const start = (page - 1) * limitPerPage;
      currentRadios = filtered.slice(start, start + limitPerPage);
      const nextBtn = document.getElementById("nextPage");
      if (nextBtn) nextBtn.disabled = start + limitPerPage >= filtered.length;
    } else {
      const response = await fetchFromAPI(page, limitPerPage, searchQuery);
      
      // Support both {data: []} and []
      currentRadios = (response && response.data) || (Array.isArray(response) ? response : []);
      
      if (!Array.isArray(currentRadios)) {
        currentRadios = [];
      }
      
      const nextBtn = document.getElementById("nextPage");
      if (nextBtn) nextBtn.disabled = currentRadios.length < limitPerPage;
    }
    renderPage();
  } catch (e) {
    console.error("Load error:", e);
    listEl.innerHTML = `
      <div class="loading" style="color:#ef4444">
        <div>Error loading stations</div>
        <div style="font-size:11px; opacity:0.7; margin-top:5px">${e.message}</div>
        <button class="page-btn" style="margin-top:15px" onclick="isLoadingStations=false; load(1)">Retry</button>
      </div>`;
  } finally {
    isLoadingStations = false;
  }
}

function renderPage() {
  const list = document.getElementById("list")
  if (!list) return;
  list.innerHTML = ""

  if (!Array.isArray(currentRadios) || currentRadios.length === 0) {
    list.innerHTML = `<div class="loading">${showFavoritesOnly ? "No favorites found" : "No stations found"}</div>`
    const pageInfo = document.getElementById("pageInfo");
    if (pageInfo) pageInfo.innerText = `Page ${currentPage}`;
    const prevBtn = document.getElementById("prevPage");
    if (prevBtn) prevBtn.disabled = true;
    const nextBtn = document.getElementById("nextPage");
    if (nextBtn) nextBtn.disabled = true;
    return
  }

  // Sort: Online (1) > Unknown (undefined) > Offline (0)
  const sortedRadios = [...currentRadios].filter(r => r && r.id).sort((a, b) => {
    const sA = stationStatus[a.id] === undefined ? 0.5 : stationStatus[a.id];
    const sB = stationStatus[b.id] === undefined ? 0.5 : stationStatus[b.id];
    return sB - sA;
  });

  sortedRadios.forEach((r) => {
    // If multiple streams, render each as a separate item
    const streamsToRender = (r.streams && r.streams.length > 1) ? r.streams : [ { url: r.stream } ];
    
    streamsToRender.forEach((stream, sIdx) => {
      const streamLabel = (r.streams && r.streams.length > 1) ? ` #${sIdx + 1}` : "";
      const isActive = playingRadio && playingRadio.id === r.id && playingRadio.currentStreamIndex === sIdx;
      const isFav = isFavorite(r.id);
      
      // Status from local tracking
      const statusVal = stationStatus[r.id];
      let statusClass = 'unknown';
      let statusLabel = 'Checking...';
      
      if (statusVal === 1) {
        statusClass = 'online';
        statusLabel = 'Online';
      } else if (statusVal === 0) {
        statusClass = 'offline';
        statusLabel = 'Offline';
      }

      const div = document.createElement("div")
      div.className = `item ${isActive ? 'active' : ''}`
      
      // Find index in ORIGINAL currentRadios for play()
      const origIdx = currentRadios.findIndex(rad => rad && rad.id === r.id);
      div.onclick = () => play(origIdx, sIdx)
      
      const imgSrc = r.logo || fallbackImage;
      const imgHtml = `<img src="${imgSrc}" loading="lazy" onload="this.style.opacity=1" onerror="this.src='${fallbackImage}'" style="opacity:0; transition: opacity 0.5s ease;">`
      const heartFill = isFav ? 'currentColor' : 'none';
      const heartColor = isFav ? 'var(--heart-color)' : 'currentColor';
      
      // Clean string for JSON
      const radioJson = JSON.stringify(r).replace(/"/g, '&quot;');
      
      div.innerHTML = `
        <div class="item-icon">${imgHtml}</div>
        <div class="item-details">
          <div style="display: flex; align-items: center; gap: 6px;">
            <div class="status-dot ${statusClass}" title="${statusLabel}"></div>
            <div class="item-name">${r.name}${streamLabel}</div>
          </div>
          <div class="item-status">Playing</div>
        </div>
        <div class="bars">
          <div class="bar"></div>
          <div class="bar"></div>
          <div class="bar"></div>
        </div>
        <button class="fav-btn ${isFav ? 'favorited' : ''}" onclick="toggleFavorite(event, ${radioJson})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${heartFill}" stroke="${heartColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
        </button>
      `
      list.appendChild(div)
    });
  })

  const pageInfo = document.getElementById("pageInfo");
  if (pageInfo) pageInfo.innerText = `Page ${currentPage}`;
  const prevBtn = document.getElementById("prevPage");
  if (prevBtn) prevBtn.disabled = currentPage === 1;
}

async function changePage(dir) {
  const newPage = currentPage + dir
  if (newPage >= 1) {
    currentPage = newPage
    await load(currentPage)
  }
}

async function play(indexOrRadio, streamIndex = 0) {
  // Initialize Web Audio Graph for Normalizer
  initAudioGraph();
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  // KILL ALL STALE TIMERS IMMEDIATELY
  clearTimeout(connectionTimeout);
  clearTimeout(errorTimeout);
  clearTimeout(stallTimer);
  
  let r, index;

  if (typeof indexOrRadio === 'number') {
    index = indexOrRadio;
    r = currentRadios[index];
  } else {
    r = indexOrRadio;
    index = r.indexOnPage || 0;
  }
  if (!r) return;
  
  if (playingRadio && playingRadio.id === r.id && playingRadio.currentStreamIndex === streamIndex && isPlaying) {
    toggle();
    return;
  }

  const targetStream = (r.streams && r.streams.length > streamIndex) ? r.streams[streamIndex] : {};
  let streamUrl = targetStream.url || r.stream;
  
  document.getElementById("nowSubtitle").innerText = "Connecting...";
  
  // Resolve URL (Radiojar fix)
  try {
    const resolved = await window.__TAURI__.core.invoke('resolve_url', { url: streamUrl });
    console.log("Resolved URL:", resolved);
    streamUrl = resolved;
  } catch (e) {
    console.warn("Failed to resolve URL, using original:", e);
  }

  playingRadio = {
    id: r.id,
    name: r.name,
    city: r.city,
    logo: r.logo,
    stream: streamUrl,
    streams: r.streams || [],
    currentStreamIndex: streamIndex,
    page: currentPage,
    indexOnPage: index,
    bitrate: r.bitrate || targetStream.bitrate,
    codec: r.codec || targetStream.codec,
    originalRadio: r // Store original for re-resolving if needed
  };
  
  localStorage.setItem('lastPlayedRadio', JSON.stringify(playingRadio));
  
  // Start connection timeout (1 minute for maximum patience)
  clearTimeout(connectionTimeout);
  connectionTimeout = setTimeout(() => {
    if (playingRadio && playingRadio.id === r.id && !isPlaying) {
      console.warn("Connection timeout reached (60s)");
      handleError(new Error("Connection timeout"));
    }
  }, 60000);



  if (hls) {
    hls.destroy();
    hls = null;
  }

  if (streamUrl.includes('.m3u8') && Hls.isSupported()) {
    hls = new Hls();
    hls.loadSource(streamUrl);
    hls.attachMedia(audio);
    hls.on(Hls.Events.MANIFEST_PARSED, function() {
      audio.play().then(() => {
        updateMediaSession(playingRadio);
      }).catch(e => handleError(e));
      isPlaying = true;
      updatePlayerUI();
      updateAccentColor(playingRadio.logo);
    });
    hls.on(Hls.Events.ERROR, function(event, data) {
      if (data.fatal) handleError(new Error("HLS Error"));
    });
  } else {
    // Shoutcast/Klikhost Fix: Add .mp3 suffix to trick browser into immediate playback
    let finalUrl = streamUrl;
    if (!finalUrl.includes('.m3u8') && !finalUrl.includes('?')) {
      if (finalUrl.includes('klikhost') || (finalUrl.includes(':') && finalUrl.split(':').length > 2)) {
        finalUrl += finalUrl.endsWith(';') ? '?.mp3' : '/;?.mp3';
      }
    }

    audio.crossOrigin = "anonymous";
    audio.src = finalUrl;
    
    audio.play().then(() => {
      updateMediaSession(playingRadio);
    }).catch(e => {
      console.error("Play failed, trying original URL as fallback:", e);
      // Fallback to original if trick fails
      if (audio.src !== streamUrl) {
        audio.src = streamUrl;
        audio.play().catch(err => handleError(err));
      } else {
        handleError(e);
      }
    });
    isPlaying = true;
  }

  
  updatePlayerUI();
  renderPage();
}

async function updateMediaSession(radio) {
  if (!("mediaSession" in navigator)) return;

  const artSrc = await getAsDataURL(radio.logo);
  
  navigator.mediaSession.metadata = new MediaMetadata({
    title: radio.name,
    artist: radio.city || "Indonesia",
    album: "Arch Radio",
    artwork: [
      { src: artSrc, sizes: '128x128', type: 'image/png' },
      { src: artSrc, sizes: '512x512', type: 'image/png' }
    ]
  });

  // Update Rust SMTC (Arch Radio session)
  window.__TAURI__.core.invoke('update_smtc_metadata', {
    title: radio.name,
    artist: radio.city || "Indonesia",
    imageUrl: radio.logo
  }).catch(console.error);


  navigator.mediaSession.setActionHandler("play", () => toggle());
  navigator.mediaSession.setActionHandler("pause", () => toggle());
  navigator.mediaSession.setActionHandler("previoustrack", () => prev());
  navigator.mediaSession.setActionHandler("nexttrack", () => next());
}

function changeVolume(val) {
  audio.volume = val;
  localStorage.setItem('radioVolume', val);
}

let errorTimeout = null;
function handleError(e) {
  console.log("Play error:", e)
  tryNextStream(); // Attempt fallback first
}

function setStationStatus(id, status) {
  if (!id) return;
  stationStatus[id] = status;
  localStorage.setItem('stationStatus', JSON.stringify(stationStatus));
  // Re-render to reflect status change if visible
  renderPage();
}

let dialogResolve = null;
function showConfirm(title, message) {
  return new Promise((resolve) => {
    document.getElementById("dialogTitle").innerText = title;
    document.getElementById("dialogMsg").innerText = message;
    document.getElementById("dialogBackdrop").classList.add("active");
    dialogResolve = resolve;
  });
}

function closeDialog(result) {
  document.getElementById("dialogBackdrop").classList.remove("active");
  if (dialogResolve) dialogResolve(result);
  dialogResolve = null;
}

let toastTimeout = null;
function showToast(message, duration = 3000) {
  const toast = document.getElementById("toast");
  const msg = document.getElementById("toastMsg");
  
  msg.innerText = message;
  toast.classList.add("show");
  
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}

async function resetStationStatus() {
    const confirmed = await showConfirm(
        "Reset Cache", 
        "Reset online/offline status for all stations? Your favorites list will remain safe."
    );
    
    if (confirmed) {
        // 1. Empty the status object
        stationStatus = {}; 
        
        // 2. Clear from persistent storage
        localStorage.removeItem('stationStatus'); 
        
        // 3. Re-render list (IMPORTANT: so red/green dots become gray)
        renderPage(); 
        
        showToast("Status cache has been reset!");
        
        // Optional: Close settings overlay after reset
        // toggleSettings(); 
    }
}




function tryNextStream() {
  if (!playingRadio || !playingRadio.streams || playingRadio.currentStreamIndex >= playingRadio.streams.length - 1) {
    console.log("All streams failed, skipping station...");
    
    // Don't mark offline immediately, might be transient
    // setStationStatus(playingRadio.id, 0);

    isPlaying = false

    document.getElementById("nowSubtitle").innerText = "Error playing stream, skipping..."
    updatePlayerUI()
    
    clearTimeout(errorTimeout);
    errorTimeout = setTimeout(() => {
      // Check again if we are still not playing before skipping
      if (!isPlaying) {
        console.log("Still not playing after grace period, skipping...");
        next();
      }
    }, 15000); // Wait 15s after all streams "failed" before skipping station
    return;

  }

  playingRadio.currentStreamIndex++;
  const nextUrl = playingRadio.streams[playingRadio.currentStreamIndex].url;
  console.log(`Trying backup stream #${playingRadio.currentStreamIndex}: ${nextUrl}`);
  document.getElementById("nowSubtitle").innerText = "Switching to backup...";
  
  // Support HLS in fallback
  if (hls) { hls.destroy(); hls = null; }
  
  if (nextUrl.includes('.m3u8') && Hls.isSupported()) {
    hls = new Hls();
    hls.loadSource(nextUrl);
    hls.attachMedia(audio);
    hls.on(Hls.Events.MANIFEST_PARSED, () => audio.play().catch(err => tryNextStream()));
  } else {
    // Shoutcast/Klikhost Fix for Fallback
    let finalUrl = nextUrl;
    if (!finalUrl.includes('.m3u8') && !finalUrl.includes('?')) {
      if (finalUrl.includes('klikhost') || (finalUrl.includes(':') && finalUrl.split(':').length > 2)) {
        finalUrl += finalUrl.endsWith(';') ? '?.mp3' : '/;?.mp3';
      }
    }

    audio.crossOrigin = "anonymous";
    audio.src = finalUrl;
    
    audio.play().catch(err => {
      console.error("Backup failed with trick, trying original fallback...", err);
      if (audio.src !== nextUrl) {
        audio.src = nextUrl;
        audio.play().catch(e => tryNextStream());
      } else {
        tryNextStream();
      }
    });
  }


  // Reset connection timeout for the next attempt (60s)
  clearTimeout(connectionTimeout);
  connectionTimeout = setTimeout(() => {
    if (playingRadio && !audio.playing && isPlaying) {
      handleError(new Error("Connection timeout"));
    }
  }, 60000);


}

function toggle(e) {
  // Initialize Web Audio Graph for Normalizer
  initAudioGraph();
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  if (e) e.stopPropagation();
  if (!playingRadio) {
    if (currentRadios.length > 0) play(0)
    return
  }
  
  // Handle restored state (audio.src is empty)
  if (!audio.src && playingRadio) {
    play(playingRadio.originalRadio || playingRadio, playingRadio.currentStreamIndex || 0);
    return;
  }

  if (audio.paused) {
    audio.play().catch(e => handleError(e))
    isPlaying = true
  } else {
    audio.pause()
    isPlaying = false
  }
  updatePlayerUI()
}

async function next(e) {
  if (e) e.stopPropagation();
  if (!playingRadio) return;
  
  const nextIndex = playingRadio.indexOnPage + 1;
  if (nextIndex < limitPerPage) {
    if (currentPage === playingRadio.page) {
      if (currentRadios[nextIndex]) play(nextIndex);
    } else {
      currentPage = playingRadio.page;
      await load(currentPage);
      if (currentRadios[nextIndex]) play(nextIndex);
    }
  } else {
    currentPage = playingRadio.page + 1;
    await load(currentPage);
    if (currentRadios.length > 0) {
      play(0);
    }
  }
}

async function prev(e) {
  if (e) e.stopPropagation();
  if (!playingRadio) return;
  
  if (playingRadio.indexOnPage > 0) {
    const prevIndex = playingRadio.indexOnPage - 1;
    if (currentPage === playingRadio.page) {
      play(prevIndex);
    } else {
      currentPage = playingRadio.page;
      await load(currentPage);
      play(prevIndex);
    }
  } else {
    if (playingRadio.page > 1) {
      currentPage = playingRadio.page - 1;
      await load(currentPage);
      if (currentRadios.length > 0) {
        play(currentRadios.length - 1);
      }
    }
  }
}

let smtcUpdateTimeout = null;
function updateSMTC(title, artist, logo) {
  clearTimeout(smtcUpdateTimeout);
  smtcUpdateTimeout = setTimeout(() => {
    if (window.__TAURI__) {
      window.__TAURI__.core.invoke('update_smtc_metadata', {
        title: title,
        artist: artist,
        imageUrl: logo || null
      }).catch(console.error);
    }
  }, 500); // 500ms debounce
}

function updatePlayerUI() {

  if (playingRadio) {
    document.getElementById("nowTitle").innerText = playingRadio.name
    updateAccentColor(playingRadio.logo);

    // Update bitrate and codec
    const bBadge = document.getElementById("badgeBitrate");
    const cBadge = document.getElementById("badgeCodec");
    const infoContainer = document.getElementById("streamInfo");
    
    // Always show in expanded mode, use '--' as fallback
    bBadge.innerText = playingRadio.bitrate ? `${playingRadio.bitrate} kbps` : "-- kbps";
    cBadge.innerText = playingRadio.codec || "--";
    bBadge.style.display = "inline-block";
    cBadge.style.display = "inline-block";
    infoContainer.style.display = "flex";
    
    const imgSrc = playingRadio.logo || fallbackImage;
    document.getElementById("nowImg").innerHTML = `<img src="${imgSrc}" onerror="this.src='${fallbackImage}'">`;
    
    // Update expanded player background
    document.getElementById("expandedBg").style.backgroundImage = `url(${imgSrc})`;
    
    if (document.getElementById("nowSubtitle").innerText !== "Connecting..." && 
        !document.getElementById("nowSubtitle").innerText.startsWith("Error")) {
      const statusText = isPlaying ? "Now playing" : "Paused";
      document.getElementById("nowSubtitle").innerHTML = `<span>• Arch Radio • ${statusText}</span>`;
      if (isPlaying) {
        updateTrayMarquee(playingRadio.name, "Now playing");
      }
    }
    
    // Update favorite button in player
    const favBtn = document.getElementById("nowFavBtn");
    favBtn.style.display = "flex";
    if (isFavorite(playingRadio.id)) {
      favBtn.classList.add('favorited');
      favBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>';
    } else {
      favBtn.classList.remove('favorited');
      favBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>';
    }
    // Update Media Session (Windows/OS Media Controls) handled via updateMediaSession()

    document.title = `Arch Radio - ${playingRadio.name}`;
  }
  
  document.getElementById("playBtn").innerHTML = isPlaying ? pauseIcon : playIcon
  
  if (isPlaying) {
    document.body.classList.add('is-playing');
  } else {
    document.body.classList.remove('is-playing');
  }

  const bars = document.querySelectorAll('.bar');
  bars.forEach(bar => {
    bar.style.animationPlayState = isPlaying ? 'running' : 'paused';
  });

  // Poll metadata with a slight delay if it's the first time
  clearTimeout(metadataTimeout);
    metadataTimeout = setTimeout(pollMetadata, isPlaying ? 5000 : 15000);
}


let metadataTimeout = null;
async function pollMetadata() {

  if (!playingRadio || !isPlaying) return;
  
  try {
    const meta = await window.__TAURI__.core.invoke('fetch_metadata', { url: playingRadio.stream });
    if (meta && isPlaying) {
      const fullText = `• Arch Radio • ${meta}`;
      const displayStr = `${fullText} &nbsp;&nbsp;&nbsp;&nbsp; ${fullText} &nbsp;&nbsp;&nbsp;&nbsp;`;
      const subtitleEl = document.getElementById("nowSubtitle");
      
      // Always use marquee-content regardless of length
      subtitleEl.innerHTML = `<span class="marquee-content">${displayStr}</span>`;
      
      updateTrayMarquee(playingRadio.name, meta);

      // Sync with Rust SMTC (Debounced)
      updateSMTC(meta, playingRadio.name, playingRadio.logo);

    }
  } catch (e) {
    // Silently fail if no metadata
  }
  
  clearTimeout(metadataTimeout);
  metadataTimeout = setTimeout(pollMetadata, 20000); // Poll every 20s
}


// Audio events
audio.addEventListener('waiting', () => {
  document.getElementById("nowSubtitle").innerText = "Buffering...";
});

let stallTimer = null;
audio.addEventListener('stalled', () => {
  document.getElementById("nowSubtitle").innerText = "Stalled... retrying";
  
  // Clear any previous stall timer
  clearTimeout(stallTimer);
  
  // Give it 10 seconds (up from 4), then try to reload the current stream
  stallTimer = setTimeout(() => {
    if (!isPlaying || !playingRadio) return;
    
    const currentSrc = audio.src;
    console.warn("Stream stalled, reloading:", currentSrc);
    
    // Reload the current stream URL
    audio.src = "";
    audio.load();
    audio.src = currentSrc;
    audio.play().catch(err => {
      console.error("Reload after stall failed:", err);
      // Wait another bit before fully failing
      setTimeout(() => {
        if (!isPlaying) handleError(err);
      }, 5000);
    });
  }, 10000);

});

audio.addEventListener('playing', () => {
  isPlaying = true;
  clearTimeout(connectionTimeout);
  clearTimeout(stallTimer);
  clearTimeout(errorTimeout); // Cancel any pending skips
  
  const subtitle = document.getElementById("nowSubtitle");

  if (subtitle.innerText === "Connecting..." || subtitle.innerText === "Buffering...") {
    subtitle.innerText = "Now playing";
  }
  
  if (playingRadio) {
    setStationStatus(playingRadio.id, 1);
    // Initial SMTC update for the station
    updateSMTC(playingRadio.name, "Now playing", playingRadio.logo);
  }

  updatePlayerUI();

  if (window.__TAURI__) window.__TAURI__.core.invoke('update_smtc_status', { playing: true });
});



audio.addEventListener('error', () => {
  console.error("Audio stream error");
  setStationStatus(playingRadio ? playingRadio.id : null, 0);
  handleError(new Error("Audio stream failed"));
});

audio.onpause = () => { 
  isPlaying = false; 
  updatePlayerUI(); 
  if (window.__TAURI__) window.__TAURI__.core.invoke('update_smtc_status', { playing: false });
}
audio.onended = () => { next(); }


// Initialize settings and window state on load
setTimeout(() => {
  if (window.__TAURI__) {
    // Set normal mode first, then apply settings (AOT, etc)
    window.__TAURI__.core.invoke('set_widget_mode', { enabled: false })
      .then(() => {
        applySettingsState();
      });
  } else {
    applySettingsState();
  }
}, 1000);



// Init Updater - check silently on startup
setTimeout(() => {
  updateAppVersion();
  checkUpdatesSilently();
  restoreLastPlayed();
}, 5000);

// Emergency reset on load
document.getElementById("settingsOverlay").classList.remove("active");
document.getElementById("mainPlayer").classList.remove("expanded");

initGeolocation();

// Disable Context Menu
document.addEventListener('contextmenu', e => e.preventDefault());

// Disable DevTools shortcuts
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) e.preventDefault();
  if (e.key === 'F12') e.preventDefault();
  if (e.ctrlKey && e.key === 'U') e.preventDefault();
});

// Handle Tray Events
if (window.__TAURI__ && window.__TAURI__.event) {
  window.__TAURI__.event.listen('tray-play-pause', () => toggle());
  window.__TAURI__.event.listen('tray-next', () => next());
  window.__TAURI__.event.listen('tray-prev', () => prev());
  window.__TAURI__.event.listen('tray-toggle-compact', () => {
    const isNowCompact = document.body.classList.contains('compact-mode');
    toggleCompactMode(!isNowCompact);
  });

  // SMTC Events
  window.__TAURI__.event.listen('smtc-play', () => toggle());
  window.__TAURI__.event.listen('smtc-pause', () => toggle());
  window.__TAURI__.event.listen('smtc-next', () => next());
  window.__TAURI__.event.listen('smtc-prev', () => prev());
}
