import { useState, useCallback, useRef } from 'react';

/**
 * useNotifications - manages notification state and browser permission
 */
export function useNotifications({ alertMutedDefault = false } = {}) {
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [alertMuted, setAlertMuted] = useState(
    () => localStorage.getItem('mediroute_alert_muted') === 'true' || alertMutedDefault
  );
  const [permission, setPermission] = useState(
    typeof window.Notification === 'undefined' ? 'unsupported' : window.Notification.permission
  );
  const audioCtxRef = useRef(null);
  const seenRef = useRef(new Set());

  const playAlert = useCallback(() => {
    if (alertMuted) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = audioCtxRef.current || new AudioContext();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const start = ctx.currentTime;
      [0, 0.18, 0.36].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = i === 1 ? 660 : 880;
        gain.gain.setValueAtTime(0.0001, start + offset);
        gain.gain.exponentialRampToValueAtTime(0.12, start + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start + offset);
        osc.stop(start + offset + 0.15);
      });
    } catch { /* blocked */ }
  }, [alertMuted]);

  const addNotification = useCallback((n) => {
    const key = `${n.id}-${n.createdAt}-${n.type}`;
    if (seenRef.current.has(key)) return;
    seenRef.current.add(key);
    setNotifications((prev) => [n, ...prev].slice(0, 30));
    setUnread((c) => c + 1);
    setPanelOpen(true);
    playAlert();
    if (window.Notification?.permission === 'granted') {
      new window.Notification(n.title, { body: n.message, tag: n.id });
    }
  }, [playAlert]);

  const toggleMute = useCallback(() => {
    setAlertMuted((m) => {
      const next = !m;
      localStorage.setItem('mediroute_alert_muted', String(next));
      return next;
    });
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window.Notification === 'undefined') { setPermission('unsupported'); return; }
    const p = await window.Notification.requestPermission();
    setPermission(p);
  }, []);

  const openPanel = useCallback(() => { setPanelOpen(true); setUnread(0); }, []);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const clearAll = useCallback(() => { setNotifications([]); setUnread(0); }, []);

  return {
    notifications, unread, panelOpen, alertMuted, permission,
    addNotification, toggleMute, requestPermission, openPanel, closePanel, clearAll
  };
}
