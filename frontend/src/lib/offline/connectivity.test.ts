import { describe, expect, it, vi } from 'vitest';

import { getIsOnline, reportOffline, reportOnline, subscribeConnectivity } from './connectivity';

describe('connectivity — Modul-Emitter für den Online-Zustand', () => {
  it('reportOffline setzt den Zustand und benachrichtigt Subscriber', () => {
    reportOnline();
    const listener = vi.fn();
    const unsubscribe = subscribeConnectivity(listener);

    reportOffline();

    expect(getIsOnline()).toBe(false);
    expect(listener).toHaveBeenCalledWith(false);
    unsubscribe();
  });

  it('doppelte Meldungen desselben Zustands feuern nicht erneut', () => {
    reportOnline();
    const listener = vi.fn();
    const unsubscribe = subscribeConnectivity(listener);

    reportOnline();
    reportOnline();

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('nach unsubscribe wird der Listener nicht mehr aufgerufen', () => {
    reportOnline();
    const listener = vi.fn();
    const unsubscribe = subscribeConnectivity(listener);
    unsubscribe();

    reportOffline();

    expect(listener).not.toHaveBeenCalled();
    // Aufräumen für nachfolgende Tests in dieser Datei.
    reportOnline();
  });

  it('reportOnline nach Offline-Phase benachrichtigt mit true', () => {
    reportOffline();
    const listener = vi.fn();
    const unsubscribe = subscribeConnectivity(listener);

    reportOnline();

    expect(getIsOnline()).toBe(true);
    expect(listener).toHaveBeenCalledWith(true);
    unsubscribe();
  });
});
