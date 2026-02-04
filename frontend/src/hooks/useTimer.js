import { useState, useEffect, useRef } from 'react';

export const useTimer = (isActive = false, onTick = null, tickInterval = 1000) => {
    const [seconds, setSeconds] = useState(0);
    const timerRef = useRef(null);

    useEffect(() => {
        if (isActive) {
            timerRef.current = setInterval(() => {
                setSeconds((prev) => {
                    const next = prev + 1;
                    if (onTick) onTick(next);
                    return next;
                });
            }, tickInterval);
        } else {
            clearInterval(timerRef.current);
        }

        return () => clearInterval(timerRef.current);
    }, [isActive, onTick, tickInterval]);

    const resetTimer = () => {
        setSeconds(0);
    };

    const formatTime = (totalSeconds) => {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;

        return [hours, minutes, secs]
            .map((v) => (v < 10 ? '0' + v : v))
            .filter((v, i) => v !== '00' || i > 0)
            .join(':');
    };

    return {
        seconds,
        resetTimer,
        formatTime: () => formatTime(seconds),
    };
};
