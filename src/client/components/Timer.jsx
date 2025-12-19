import React, { useEffect, useState, useRef } from 'react';

const SessionTimer = ({ endTime, onExpire, label = 'Total Time Remaining', compact = false, clockOffsetMs = 0 }) => {
  const [timeLeft, setTimeLeft] = useState(() => Math.max(0, endTime ? endTime - (Date.now() + clockOffsetMs) : 0));
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);

  // Keep onExpire ref updated to avoid stale closures
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  // Tick down based on an absolute end time so rerenders don't reset the timer
  useEffect(() => {
    expiredRef.current = false;
    if (!endTime) return undefined;

    const tick = () => {
      const remaining = Math.max(0, endTime - (Date.now() + clockOffsetMs));
      setTimeLeft(remaining);

      if (remaining === 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current?.();
      }
    };

    tick(); // sync immediately
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endTime, clockOffsetMs]);

  if (!endTime) {
    return null;
  }

  const totalSeconds = Math.max(0, Math.floor(timeLeft / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const isWarning = timeLeft <= 5 * 60 * 1000;

  const formatted = hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className={`timer ${compact ? 'timer-compact' : ''} ${isWarning ? 'warning' : ''}`}>
      {!compact && <span className="timer-label">{label}: </span>}
      <span className="timer-value" aria-live="polite">
        {formatted}
      </span>
    </div>
  );
};

export default SessionTimer;



