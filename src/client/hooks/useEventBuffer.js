import { useRef, useEffect } from 'react';

const FLUSH_INTERVAL_MS = 5000;
const BATCH_SIZE = 5;

export const useEventBuffer = (sessionId) => {
  const buffer = useRef([]);
  const timer = useRef(null);

  const flush = async () => {
    if (buffer.current.length === 0) return;
    
    const eventsToSend = [...buffer.current];
    buffer.current = []; // Clear buffer immediately to prevent duplicates

    try {
      const res = await fetch('/api/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventsToSend)
      });
      
      if (!res.ok) {
        throw new Error('Failed to flush events');
      }
    } catch (err) {
      console.error('Event flush failed, retrying...', err);
      // Simple retry strategy: put back at front?
      // Or just re-add. If we crash, we lose logs.
      // For now, re-add to buffer
      buffer.current = [...eventsToSend, ...buffer.current];
    }
  };

  const log = (type, payload = {}, microworldId = null, phase = null, stepIndex = null) => {
    if (!sessionId) return;

    const event = {
      sessionId,
      microworldId,
      phase,
      stepIndex,
      timestamp: new Date().toISOString(),
      clientTime: new Date().toISOString(), // Redundant but per spec
      type,
      payload
    };

    buffer.current.push(event);

    if (buffer.current.length >= BATCH_SIZE) {
      flush();
    }
  };

  // Setup periodic flush
  useEffect(() => {
    timer.current = setInterval(flush, FLUSH_INTERVAL_MS);
    
    // Flush on unload
    const handleUnload = () => {
      // Use beacon for reliable unload sending?
      // Navigator.sendBeacon only supports string/blob/formdata
      // We'll try synchronous flush (deprecated) or just hope async fetch works
      // Actually sendBeacon is best for unload.
      if (buffer.current.length > 0 && sessionId) {
         const blob = new Blob([JSON.stringify(buffer.current)], { type: 'application/json' });
         navigator.sendBeacon('/api/event', blob);
      }
    };
    
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(timer.current);
      window.removeEventListener('beforeunload', handleUnload);
      flush(); // Flush on unmount
    };
  }, [sessionId]);

  return { log, flush };
};



