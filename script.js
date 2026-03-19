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
let isSwRunning = false;
let swStartTime = 0;
let swElapsedTime = 0;
let swSavedTime = 0;
let swLaps = [];
let isTmRunning = false;
let tmRemainingSeconds = 0;
let tmTotalSeconds = 0;
let tmEndTime = 0;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let keepAliveCtx = null;
let keepAliveSource = null;
let keepAliveAudio = new Audio();
keepAliveAudio.autoplay = true;
keepAliveAudio.loop = true;

function playBeep(type = 'normal') {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    if (type === 'finish') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(500, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.5);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.5);
    } else {
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);
    }
}

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
        keepAliveAudio.play().catch(() => {});
    } else {
        keepAliveAudio.play().catch(() => {});
    }
}

function stopKeepAlive() {
    keepAliveAudio.pause();
}

let wakeLock = null;
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {}
}
async function releaseWakeLock() {
    if (wakeLock !== null) {
        await wakeLock.release();
        wakeLock = null;
    }
}

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

function formatTmTime(totalSeconds) {
    const d = Math.floor(totalSeconds / 86400);
    const h = Math.floor((totalSeconds % 86400) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const dStr = d.toString().padStart(2, '0');
    const hStr = h.toString().padStart(2, '0');
    const mStr = m.toString().padStart(2, '0');
    const sStr = s.toString().padStart(2, '0');
    if (d > 0) return `${dStr}:${hStr}:${mStr}:${sStr}`;
    if (h > 0) return `${hStr}:${mStr}:${sStr}`;
    return `${mStr}:${sStr}`;
}

let lastMediaUpdateSecond = -1;
function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;

    let title = '';
    let artist = '';
    let isRunning = false;

    if (currentMode === 'stopwatch') {
        title = '碼錶';
        const formatted = formatSwTime(swElapsedTime);
        const currentSecond = Math.floor(swElapsedTime / 1000);
        if (currentSecond === lastMediaUpdateSecond && isSwRunning) return;
        lastMediaUpdateSecond = currentSecond;
        artist = formatted.main;
        isRunning = isSwRunning;
    } else {
        title = '計時器';
        artist = formatTmTime(tmRemainingSeconds);
        isRunning = isTmRunning;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
        title: title,
        artist: artist,
        artwork: [{ src: 'icon/icon-512x512.png', sizes: '512x512', type: 'image/png' }]
    });

    navigator.mediaSession.playbackState = isRunning ? 'playing' : 'paused';

    navigator.mediaSession.setActionHandler('play', () => {
        if (currentMode === 'stopwatch') startStopwatch(); else startTimer();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
        if (currentMode === 'stopwatch') stopStopwatch(); else stopTimer();
    });
}

const timerWorker = new Worker('timer-worker.js');
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

function updateSwDisplay() {
    const formatted = formatSwTime(swElapsedTime);
    swTime.textContent = formatted.main;
    swMs.textContent = formatted.ms;
    updateMediaSession();
}

function updateTmDisplay() {
    tmTime.textContent = formatTmTime(tmRemainingSeconds);
    updateMediaSession();
}

function startStopwatch() {
    if (isSwRunning) return;
    playBeep('normal');
    isSwRunning = true;
    swStartTime = Date.now();
    initKeepAlive();
    requestWakeLock();
    timerWorker.postMessage({ command: 'START', type: 'STOPWATCH', endTime: swStartTime });
    swStart.textContent = '暫停';
    swStart.classList.replace('primary', 'danger');
    swLap.disabled = false;
    swReset.disabled = false;
    updateMediaSession();
}

function stopStopwatch() {
    if (!isSwRunning) return;
    playBeep('normal');
    isSwRunning = false;
    swSavedTime = swElapsedTime;
    timerWorker.postMessage({ command: 'STOP' });
    swStart.textContent = '繼續';
    swStart.classList.replace('danger', 'primary');
    swLap.disabled = true;
    stopKeepAlive();
    releaseWakeLock();
    updateMediaSession();
}

function startTimer() {
    if (isTmRunning) return;
    if (tmRemainingSeconds === 0) {
        const d = parseInt(tiDays.value) || 0;
        const h = parseInt(tiHours.value) || 0;
        const m = parseInt(tiMinutes.value) || 0;
        const s = parseInt(tiSeconds.value) || 0;
        tmTotalSeconds = d * 86400 + h * 3600 + m * 60 + s;
        tmRemainingSeconds = tmTotalSeconds;
        if (tmTotalSeconds === 0) return;
    }
    playBeep('normal');
    if (Notification.permission === 'default') Notification.requestPermission();
    timerInputArea.classList.remove('active-input');
    timerDisplayArea.classList.add('active-input');
    isTmRunning = true;
    tmEndTime = Date.now() + tmRemainingSeconds * 1000;
    initKeepAlive();
    requestWakeLock();
    timerWorker.postMessage({ command: 'START', type: 'TIMER', endTime: tmEndTime });
    tmStart.textContent = '暫停';
    tmStart.classList.replace('primary', 'danger');
    tmReset.disabled = false;
    updateMediaSession();
}

function stopTimer() {
    if (!isTmRunning) return;
    playBeep('normal');
    isTmRunning = false;
    timerWorker.postMessage({ command: 'STOP' });
    tmStart.textContent = '繼續';
    tmStart.classList.replace('danger', 'primary');
    stopKeepAlive();
    releaseWakeLock();
    updateMediaSession();
}

swStart.addEventListener('click', () => {
    if (isSwRunning) stopStopwatch(); else startStopwatch();
});

swReset.addEventListener('click', () => {
    playBeep('normal');
    timerWorker.postMessage({ command: 'STOP' });
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
    updateMediaSession();
});

swLap.addEventListener('click', () => {
    if (!isSwRunning) return;
    playBeep('normal');
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

tmStart.addEventListener('click', () => {
    if (isTmRunning) stopTimer(); else startTimer();
});

tmReset.addEventListener('click', () => {
    playBeep('normal');
    timerWorker.postMessage({ command: 'STOP' });
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
    updateMediaSession();
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
    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200, 100, 200]);
}

alertCloseBtn.addEventListener('click', () => {
    alertModal.classList.remove('active');
});

[tiDays, tiHours, tiMinutes, tiSeconds].forEach(input => {
    input.addEventListener('change', () => {
        let val = parseInt(input.value);
        if (isNaN(val)) { input.value = ''; return; }
        if (input.id === 'ti-days' && val > 99) val = 99;
        if (input.id === 'ti-hours' && val > 23) val = 23;
        if (input.id === 'ti-minutes' && val > 59) val = 59;
        if (input.id === 'ti-seconds' && val > 59) val = 59;
        if (val < 0) val = 0;
        input.value = val;
    });
});

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
    updateMediaSession();
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
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
            if (distance < 60) {
                const force = (60 - distance) / 60;
                const moveX = -(distX / distance) * force * 10;
                const moveY = -(distY / distance) * force * 10;
                span.style.transform = `translate(${moveX}px, ${moveY}px)`;
            } else {
                span.style.transform = `translate(0, 0)`;
            }
        });
    });
}
