
const btnStopwatch = document.getElementById('btn-stopwatch');
const btnTimer = document.getElementById('btn-timer');
const stopwatchView = document.getElementById('stopwatch-view');
const timerView = document.getElementById('timer-view');

const swTime = document.getElementById('sw-time');
const swMs = document.getElementById('sw-ms');
const swStart = document.getElementById('sw-start');
const swLap = document.getElementById('sw-lap');
const swReset = document.getElementById('sw-reset');
const lapsList = document.getElementById('laps-list');

const timerInputArea = document.getElementById('timer-input-area');
const timerDisplayArea = document.getElementById('timer-display-area');
const tiDays = document.getElementById('ti-days');
const tiHours = document.getElementById('ti-hours');
const tiMinutes = document.getElementById('ti-minutes');
const tiSeconds = document.getElementById('ti-seconds');
const tmTime = document.getElementById('tm-time');
const tmStart = document.getElementById('tm-start');
const tmReset = document.getElementById('tm-reset');

const alertModal = document.getElementById('alert-modal');
const alertCloseBtn = document.getElementById('alert-close-btn');

let currentMode = 'stopwatch';

btnStopwatch.addEventListener('click', () => switchMode('stopwatch'));
btnTimer.addEventListener('click', () => switchMode('timer'));

function switchMode(mode) {
    if (currentMode === mode) return;
    currentMode = mode;
    
    if (mode === 'stopwatch') {
        btnStopwatch.classList.add('active');
        btnTimer.classList.remove('active');
        stopwatchView.classList.add('active-view');
        timerView.classList.remove('active-view');
    } else {
        btnTimer.classList.add('active');
        btnStopwatch.classList.remove('active');
        timerView.classList.add('active-view');
        stopwatchView.classList.remove('active-view');
    }
}

// Background Timing Setup
let timerWorker = null;
try {
    timerWorker = new Worker('timer-worker.js');
    timerWorker.onmessage = function (e) {
        if (e.data.type === 'TICK') {
            if (currentMode === 'stopwatch' && isSwRunning) {
                swElapsedTime = e.data.value + swSavedTime;
                updateSwDisplay();
            } else if (currentMode === 'timer' && isTmRunning) {
                tmRemainingSeconds = e.data.value;
                updateTmDisplay();
            }
        } else if (e.data.type === 'FINISH') {
            tmRemainingSeconds = 0;
            updateTmDisplay();
            isTmRunning = false;
            
            tmStart.textContent = '開始';
            tmStart.classList.remove('danger');
            tmStart.classList.add('primary');
            
            timerDisplayArea.classList.remove('active-input');
            timerInputArea.classList.add('active-input');
            
            showAlert();
        }
    };
} catch (e) {
    console.error("Worker init failed:", e);
    timerWorker = null; // Ensure it is null if it fails
}

let fallbackSwInterval = null;
let fallbackTmInterval = null;

function tickFallback() {
    const now = Date.now();
    if (currentMode === 'stopwatch' && isSwRunning) {
        swElapsedTime = (now - swStartTime) + swSavedTime;
        updateSwDisplay();
    } else if (currentMode === 'timer' && isTmRunning) {
        const diff = Math.ceil((tmEndTime - now) / 1000);
        if (diff <= 0) {
            tmRemainingSeconds = 0;
            updateTmDisplay();
            isTmRunning = false;
            
            tmStart.textContent = '開始';
            tmStart.classList.remove('danger');
            tmStart.classList.add('primary');
            
            timerDisplayArea.classList.remove('active-input');
            timerInputArea.classList.add('active-input');
            
            showAlert();
            if (fallbackTmInterval) clearInterval(fallbackTmInterval);
        } else {
            tmRemainingSeconds = diff;
            updateTmDisplay();
        }
    }
}

// Audio Keep-Alive for iOS Background
let keepAliveCtx = null;
let keepAliveSource = null;
let keepAliveAudio = new Audio();
keepAliveAudio.autoplay = true;
keepAliveAudio.loop = true;

function initKeepAlive() {
    if (!keepAliveCtx) {
        keepAliveCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (keepAliveCtx.state === 'suspended') {
        keepAliveCtx.resume();
    }
    if (!keepAliveSource) {
        const oscillator = keepAliveCtx.createOscillator();
        const dst = keepAliveCtx.createMediaStreamDestination();
        const gain = keepAliveCtx.createGain();

        gain.gain.value = 0.001; 
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(0, keepAliveCtx.currentTime);

        oscillator.connect(gain);
        gain.connect(dst);

        oscillator.start();
        keepAliveSource = oscillator;

        keepAliveAudio.srcObject = dst.stream;
        keepAliveAudio.play().catch(e => console.error("Keep-Alive Play Failed:", e));
    } else {
        keepAliveAudio.play().catch(e => console.error("Keep-Alive Resume Failed:", e));
    }
}

function stopKeepAlive() {
    keepAliveAudio.pause();
}

// Wake Lock
let wakeLock = null;
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {
        console.log(`Wake Lock Error: ${err.name}, ${err.message}`);
    }
}
async function releaseWakeLock() {
    if (wakeLock !== null) {
        await wakeLock.release();
        wakeLock = null;
    }
}

// Stopwatch Logic
let swStartTime = 0;
let swElapsedTime = 0;
let swSavedTime = 0;
let isSwRunning = false;
let swLaps = [];

function formatSwTime(time) {
    const hours = Math.floor(time / 3600000);
    const minutes = Math.floor((time % 3600000) / 60000);
    const seconds = Math.floor((time % 60000) / 1000);
    const ms = Math.floor((time % 1000) / 10);
    
    const h = hours.toString().padStart(2, '0');
    const m = minutes.toString().padStart(2, '0');
    const s = seconds.toString().padStart(2, '0');
    const msStr = ms.toString().padStart(2, '0');
    
    return { main: `${h}:${m}:${s}`, ms: `.${msStr}` };
}

function updateSwDisplay() {
    const formatted = formatSwTime(swElapsedTime);
    swTime.textContent = formatted.main;
    swMs.textContent = formatted.ms;
    
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: '碼錶',
            artist: `${formatted.main}${formatted.ms}`,
            artwork: [{ src: 'icon/icon-512x512.png', sizes: '512x512', type: 'image/png' }]
        });
    }
}

swStart.addEventListener('click', () => {
    playBeep('normal');
    if (isSwRunning) {
        isSwRunning = false;
        swSavedTime = swElapsedTime;
        if (timerWorker) {
            timerWorker.postMessage({ command: 'STOP' });
        } else {
            if (fallbackSwInterval) clearInterval(fallbackSwInterval);
        }
        
        swStart.textContent = '繼續';
        swStart.classList.remove('danger');
        swStart.classList.add('primary');
        swLap.disabled = true;
        
        stopKeepAlive();
        releaseWakeLock();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    } else {
        isSwRunning = true;
        swStartTime = Date.now();
        
        initKeepAlive();
        requestWakeLock();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        
        if (timerWorker) {
            timerWorker.postMessage({ command: 'START', type: 'STOPWATCH', endTime: swStartTime });
        } else {
            if (fallbackSwInterval) clearInterval(fallbackSwInterval);
            fallbackSwInterval = setInterval(tickFallback, 10);
        }
        
        swStart.textContent = '暫停';
        swStart.classList.remove('primary');
        swStart.classList.add('danger');
        swLap.disabled = false;
        swReset.disabled = false;
    }
});

swReset.addEventListener('click', () => {
    playBeep('normal');
    if (timerWorker) {
        timerWorker.postMessage({ command: 'STOP' });
    } else {
        if (fallbackSwInterval) clearInterval(fallbackSwInterval);
    }
    isSwRunning = false;
    swElapsedTime = 0;
    swSavedTime = 0;
    swStartTime = 0;
    swLaps = [];
    updateSwDisplay();
    lapsList.innerHTML = '';
    
    swStart.textContent = '開始';
    swStart.classList.remove('danger');
    swStart.classList.add('primary');
    swLap.disabled = true;
    swReset.disabled = true;
    
        releaseWakeLock();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
});

swLap.addEventListener('click', () => {
    playBeep('normal');
    if (!isSwRunning) return;
    
    const currentLapTime = swElapsedTime;
    const lapDiff = swLaps.length > 0 ? currentLapTime - swLaps[swLaps.length - 1] : currentLapTime;
    swLaps.push(currentLapTime);
    
    const li = document.createElement('li');
    li.classList.add('lap-item');
    
    const numSpan = document.createElement('span');
    numSpan.classList.add('lap-number');
    numSpan.textContent = `計圈 ${swLaps.length}`;
    
    const timeSpan = document.createElement('span');
    timeSpan.classList.add('lap-time');
    
    const lapFormatted = formatSwTime(lapDiff);
    const totalFormatted = formatSwTime(currentLapTime);
    timeSpan.textContent = `+${lapFormatted.main}${lapFormatted.ms} (${totalFormatted.main}${totalFormatted.ms})`;
    
    li.appendChild(numSpan);
    li.appendChild(timeSpan);
    
    lapsList.prepend(li);
});

[tiDays, tiHours, tiMinutes, tiSeconds].forEach(input => {
    input.addEventListener('change', () => {
        let val = parseInt(input.value);
        if (isNaN(val)) {
            input.value = '';
            return;
        }
        if (input.id === 'ti-days' && val > 99) val = 99;
        if (input.id === 'ti-hours' && val > 23) val = 23;
        if (input.id === 'ti-minutes' && val > 59) val = 59;
        if (input.id === 'ti-seconds' && val > 59) val = 59;
        if (val < 0) val = 0;
        input.value = val;
    });
});

let tmTotalSeconds = 0;
let tmRemainingSeconds = 0;
let isTmRunning = false;
let tmEndTime = 0;

function formatTmTime(totalSeconds) {
    const d = Math.floor(totalSeconds / 86400);
    const h = Math.floor((totalSeconds % 86400) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    
    const dStr = d.toString().padStart(2, '0');
    const hStr = h.toString().padStart(2, '0');
    const mStr = m.toString().padStart(2, '0');
    const sStr = s.toString().padStart(2, '0');
    
    if (d > 0) {
        return `${dStr}:${hStr}:${mStr}:${sStr}`;
    }
    if (h > 0) {
        return `${hStr}:${mStr}:${sStr}`;
    }
    return `${mStr}:${sStr}`;
}

function updateTmDisplay() {
    tmTime.textContent = formatTmTime(tmRemainingSeconds);
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: currentMode === 'timer' ? '計時器' : '碼錶',
            artist: formatTmTime(tmRemainingSeconds),
            artwork: [{ src: 'icon/icon-512x512.png', sizes: '512x512', type: 'image/png' }]
        });
    }
}

tmStart.addEventListener('click', () => {
    playBeep('normal');
    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }

    if (isTmRunning) {
        if (timerWorker) {
            timerWorker.postMessage({ command: 'STOP' });
        } else {
            if (fallbackTmInterval) clearInterval(fallbackTmInterval);
        }
        isTmRunning = false;
        
        tmStart.textContent = '繼續';
        tmStart.classList.remove('danger');
        tmStart.classList.add('primary');
        
        stopKeepAlive();
        releaseWakeLock();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    } else {
        if (tmRemainingSeconds === 0) {
            const d = parseInt(tiDays.value) || 0;
            const h = parseInt(tiHours.value) || 0;
            const m = parseInt(tiMinutes.value) || 0;
            const s = parseInt(tiSeconds.value) || 0;
            
            tmTotalSeconds = d * 86400 + h * 3600 + m * 60 + s;
            tmRemainingSeconds = tmTotalSeconds;
            
            if (tmTotalSeconds === 0) return;
        }
        
        timerInputArea.classList.remove('active-input');
        timerDisplayArea.classList.add('active-input');
        updateTmDisplay();

        initKeepAlive();
        requestWakeLock();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        
        isTmRunning = true;
        tmEndTime = Date.now() + tmRemainingSeconds * 1000;
        
        if (timerWorker) {
            timerWorker.postMessage({ command: 'START', type: 'TIMER', endTime: tmEndTime });
        } else {
            if (fallbackTmInterval) clearInterval(fallbackTmInterval);
            fallbackTmInterval = setInterval(tickFallback, 10);
        }
        
        tmStart.textContent = '暫停';
        tmStart.classList.remove('primary');
        tmStart.classList.add('danger');
        tmReset.disabled = false;
    }
});

tmReset.addEventListener('click', () => {
    playBeep('normal');
    if (timerWorker) {
        timerWorker.postMessage({ command: 'STOP' });
    } else {
        if (fallbackTmInterval) clearInterval(fallbackTmInterval);
    }
    isTmRunning = false;
    tmRemainingSeconds = 0;
    
    tmStart.textContent = '開始';
    tmStart.classList.remove('danger');
    tmStart.classList.add('primary');
    tmReset.disabled = true;
    
    timerDisplayArea.classList.remove('active-input');
    timerInputArea.classList.add('active-input');
    
    stopKeepAlive();
    releaseWakeLock();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
});

function showAlert() {
    playBeep('finish');
    alertModal.classList.add('active');
    stopKeepAlive();
    releaseWakeLock();
    
    if (Notification.permission === 'granted') {
        new Notification("時間到！", {
            body: "計時器已結束",
            icon: 'icon/icon-512x512.png',
            requireInteraction: true
        });
    }
    
    if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200, 100, 200]);
    }
}

alertCloseBtn.addEventListener('click', () => {
    alertModal.classList.remove('active');
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => { });
    });
}

const footer = document.getElementById('aki-footer');
if (footer) {
    const text = footer.textContent;
    footer.textContent = '';
    const spans = [];
    for (let char of text) {
        const span = document.createElement('span');
        span.textContent = char;
        if (char === ' ') span.style.width = '0.5em';
        span.className = 'char-span';
        footer.appendChild(span);
        spans.push(span);
    }
    document.addEventListener('mousemove', (e) => {
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        spans.forEach(span => {
            const rect = span.getBoundingClientRect();
            const charX = rect.left + rect.width / 2;
            const charY = rect.top + rect.height / 2;
            const distX = mouseX - charX;
            const distY = mouseY - charY;
            const distance = Math.sqrt(distX * distX + distY * distY);
            const maxDist = 60;
            if (distance < maxDist) {
                const force = (maxDist - distance) / maxDist;
                const moveX = -(distX / distance) * force * 10;
                const moveY = -(distY / distance) * force * 10;
                span.style.transform = `translate(${moveX}px, ${moveY}px)`;
            } else {
                span.style.transform = `translate(0, 0)`;
            }
        });
    });
}
