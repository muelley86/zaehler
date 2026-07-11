import { afterEach, describe, expect, it, vi } from 'vitest';

import { isIos, isStandalone, shouldShowIosInstallHint } from './pwaInstall';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

const stubbedKeys = new Set<string>();

/** Navigator-Felder pro Test überschreiben; afterEach räumt sie wieder ab. */
function stubNavigator(props: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(props)) {
    stubbedKeys.add(key);
    Object.defineProperty(window.navigator, key, { value, configurable: true });
  }
}

function stubDisplayModeStandalone(matches: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
    // Nur die Felder, die pwaInstall liest — der volle Stub steht in tests/setup.ts.
    const mql: Pick<MediaQueryList, 'matches' | 'media'> = {
      matches: query === '(display-mode: standalone)' && matches,
      media: query,
    };
    return mql as MediaQueryList;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of stubbedKeys) {
    delete (window.navigator as unknown as Record<string, unknown>)[key];
  }
  stubbedKeys.clear();
});

describe('isIos', () => {
  it('erkennt iPhone-Safari am User-Agent', () => {
    stubNavigator({ userAgent: IPHONE_UA });
    expect(isIos()).toBe(true);
  });

  it('erkennt iPadOS mit Desktop-UA über die Touch-Punkte', () => {
    stubNavigator({ userAgent: MAC_UA, platform: 'MacIntel', maxTouchPoints: 5 });
    expect(isIos()).toBe(true);
  });

  it('Android ist kein iOS', () => {
    stubNavigator({ userAgent: ANDROID_UA });
    expect(isIos()).toBe(false);
  });

  it('Desktop-Mac ohne Touch ist kein iOS', () => {
    stubNavigator({ userAgent: MAC_UA, platform: 'MacIntel', maxTouchPoints: 0 });
    expect(isIos()).toBe(false);
  });
});

describe('isStandalone', () => {
  it('display-mode: standalone zählt als installiert', () => {
    stubDisplayModeStandalone(true);
    expect(isStandalone()).toBe(true);
  });

  it('navigator.standalone (iOS-Home-Bildschirm) zählt als installiert', () => {
    stubNavigator({ standalone: true });
    expect(isStandalone()).toBe(true);
  });

  it('im normalen Browser-Tab nicht standalone', () => {
    expect(isStandalone()).toBe(false);
  });
});

describe('shouldShowIosInstallHint', () => {
  it('iPhone im Browser-Tab → Hinweis anzeigen', () => {
    stubNavigator({ userAgent: IPHONE_UA });
    expect(shouldShowIosInstallHint()).toBe(true);
  });

  it('iPhone bereits installiert → kein Hinweis', () => {
    stubNavigator({ userAgent: IPHONE_UA, standalone: true });
    expect(shouldShowIosInstallHint()).toBe(false);
  });

  it('Android → kein Hinweis', () => {
    stubNavigator({ userAgent: ANDROID_UA });
    expect(shouldShowIosInstallHint()).toBe(false);
  });
});
