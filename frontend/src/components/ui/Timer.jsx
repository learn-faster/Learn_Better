import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Clock } from 'lucide-react';

const Timer = ({ initialDuration = 25 * 60, onComplete }) => {
    const [timeLeft, setTimeLeft] = useState(initialDuration);
    const [isActive, setIsActive] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editMinutes, setEditMinutes] = useState(25);
    
    const timerRef = useRef(null);

    useEffect(() => {
        if (isActive && timeLeft > 0) {
            timerRef.current = setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev <= 1) {
                        clearInterval(timerRef.current);
                        setIsActive(false);
                        if (onComplete) onComplete();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else if (timeLeft === 0) {
            setIsActive(false);
        }

        return () => clearInterval(timerRef.current);
    }, [isActive, timeLeft, onComplete]);

    const toggleTimer = () => {
        setIsActive(!isActive);
    };

    const resetTimer = () => {
        setIsActive(false);
        setTimeLeft(editMinutes * 60);
    };

    const handleDurationChange = (e) => {
        const val = parseInt(e.target.value);
        if (!isNaN(val) && val > 0) {
            setEditMinutes(val);
            if (!isActive) {
                setTimeLeft(val * 60);
            }
        }
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center gap-4 w-full max-w-[250px]">
            <div className="flex items-center gap-2 text-primary-400">
                <Clock className="w-5 h-5" />
                <span className="font-semibold tracking-wider text-sm uppercase">Study Timer</span>
            </div>

            <div className="relative">
                {isEditing && !isActive ? (
                    <div className="flex items-center gap-2">
                         <input
                            type="number"
                            value={editMinutes}
                            onChange={handleDurationChange}
                            className="text-4xl font-mono font-bold bg-transparent border-b border-primary-500 text-center w-20 focus:outline-none text-white"
                            autoFocus
                            onBlur={() => setIsEditing(false)}
                        />
                        <span className="text-sm text-dark-400">min</span>
                    </div>
                ) : (
                    <div 
                        className="text-5xl font-mono font-bold text-white tracking-widest cursor-pointer hover:text-primary-400 transition-colors"
                        onClick={() => !isActive && setIsEditing(true)}
                        title="Click to edit duration"
                    >
                        {formatTime(timeLeft)}
                    </div>
                )}
            </div>

            <div className="flex items-center gap-3 w-full justify-center">
                <button 
                    onClick={toggleTimer}
                    className={`p-3 rounded-full transition-all ${
                        isActive 
                        ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' 
                        : 'bg-primary-500 text-white hover:bg-primary-600 shadow-[0_0_15px_rgba(139,92,246,0.3)]'
                    }`}
                >
                    {isActive ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                </button>
                
                <button 
                    onClick={resetTimer}
                    className="p-3 rounded-full bg-white/5 text-dark-400 hover:bg-white/10 hover:text-white transition-colors"
                >
                    <RotateCcw className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};

export default Timer;
