self.onmessage = function (e) {
    if (e.data.command === 'START') {
        const targetTime = e.data.endTime; // Can be future (Timer) or past (Stopwatch)
        const type = e.data.type; // 'TIMER' or 'STOPWATCH'

        if (self.timerId) clearInterval(self.timerId);

        self.timerId = setInterval(() => {
            const now = Date.now();
            
            if (type === 'TIMER') {
                const diff = Math.ceil((targetTime - now) / 1000);
                if (diff <= 0) {
                    self.postMessage({ type: 'FINISH' });
                    clearInterval(self.timerId);
                    self.timerId = null;
                } else {
                    self.postMessage({ type: 'TICK', value: diff });
                }
            } else if (type === 'STOPWATCH') {
                const elapsed = now - targetTime;
                self.postMessage({ type: 'TICK', value: elapsed });
            }
        }, 10);
    } else if (e.data.command === 'STOP') {
        if (self.timerId) {
            clearInterval(self.timerId);
            self.timerId = null;
        }
    }
};
