'use client';

import { useEffect, useRef, useCallback } from 'react';

const BASE_TITLE = 'Support';

/**
 * Manages browser sound + tab-title notifications for new messages.
 * Call `notify(conversationName)` whenever a new message arrives
 * that the agent hasn't seen yet (i.e. the tab is not focused or
 * it's not the currently active conversation).
 *
 * Settings are read from localStorage keys:
 *   notifications_sound    = "true" | "false"
 *   notifications_browser  = "true" | "false"
 */
export function useNotifications() {
  const unreadRef = useRef(0);
  const focusedRef = useRef(true);

  // Track tab focus
  useEffect(() => {
    const onFocus = () => {
      focusedRef.current = true;
      unreadRef.current = 0;
      document.title = BASE_TITLE;
    };
    const onBlur = () => { focusedRef.current = false; };
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Request browser notification permission once
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const playSound = useCallback(() => {
    if (localStorage.getItem('notifications_sound') === 'false') return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch {
      // Audio context not available
    }
  }, []);

  const notify = useCallback((senderName: string, preview: string) => {
    playSound();

    if (!focusedRef.current) {
      unreadRef.current += 1;
      document.title = `(${unreadRef.current}) New message — ${BASE_TITLE}`;
    }

    // Browser notification
    if (
      localStorage.getItem('notifications_browser') !== 'false' &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted' &&
      !focusedRef.current
    ) {
      new Notification(`${senderName}`, {
        body: preview,
        icon: '/favicon.ico',
        tag: 'new-message',
      });
    }
  }, [playSound]);

  return { notify };
}
