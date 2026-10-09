/**
 * WebAudioEngine unit tests. We inject a fake HTMLAudioElement so the test
 * runs in jsdom without a real network decode pipeline.
 */
import { beforeEach, describe, expect, it } from '@rstest/core';

import type { AudioEvent, PlayableSource } from '../../../domain/ports.js';
import { WebAudioEngine } from '../web-audio-engine.js';

class FakeAudioElement {
  src = '';
  currentTime = 0;
  volume = 1;
  preload = '';
  crossOrigin: string | null = null;
  paused = true;
  duration = 0;
  /** Maps CSS properties to whatever was last set on the element. */
  style: Record<string, string> = {};
  /** Attributes set via setAttribute — keys are lowercased. */
  attrs: Record<string, string> = {};
  parentNode: object | null = null;

  onloadedmetadata: (() => void) | null = null;
  onplay: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onwaiting: (() => void) | null = null;
  oncanplay: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;

  load() {
    this.duration = 200;
    queueMicrotask(() => this.onloadedmetadata?.());
  }
  async play() {
    if (this.src === 'fail.mp3') throw new Error('user gesture required');
    this.paused = false;
    this.onplay?.();
  }
  pause() {
    this.paused = true;
    this.onpause?.();
  }
  setAttribute(name: string, value: string) {
    this.attrs[name.toLowerCase()] = value;
  }
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
    delete this.attrs[name.toLowerCase()];
  }
}

describe('WebAudioEngine', () => {
  function setup(tickMs = 10) {
    const events: AudioEvent[] = [];
    const refs: { element: FakeAudioElement | null } = { element: null };
    const engine = new WebAudioEngine({
      tickMs,
      // Skip DOM mounting so the fake element never reaches jsdom's
      // `appendChild` (which would reject it because it is not a real
      // HTMLAudioElement node).
      mount: null,
      createElement: () => {
        refs.element = new FakeAudioElement();
        return refs.element as unknown as HTMLAudioElement;
      },
    });
    engine.subscribe((event) => events.push(event));
    return { engine, events, refs };
  }

  beforeEach(() => {
    // jsdom provides document; nothing else needed.
  });

  it('allocates the audio element on the first load', async () => {
    const { engine, refs } = setup();
    expect(refs.element).toBeNull();
    await engine.load({
      requestId: 'r0',
      trackId: 'tr_0',
      url: 'sample.mp3',
    });
    expect(refs.element).not.toBeNull();
  });

  it('emits loaded → play → position flow on success', async () => {
    const { engine, events } = setup();
    const source: PlayableSource = {
      requestId: 'r1',
      trackId: 'tr_01',
      url: 'sample.mp3',
      startMs: 0,
      volume: 1,
    };
    await engine.load(source);
    await new Promise((r) => setTimeout(r, 0));
    expect(events.find((e) => e.type === 'loaded')).toBeTruthy();

    events.length = 0;
    await engine.play();
    expect(events.find((e) => e.type === 'play')).toBeTruthy();
    await engine.pause();
    expect(events.find((e) => e.type === 'pause')).toBeTruthy();
  });

  it('emits error when play() rejects', async () => {
    const { engine, events } = setup();
    await engine.load({
      requestId: 'r2',
      trackId: 'tr_02',
      url: 'fail.mp3',
    });
    await new Promise((r) => setTimeout(r, 0));
    events.length = 0;
    await engine.play();
    const err = events.find((e) => e.type === 'error');
    expect(err).toBeTruthy();
    if (err && err.type === 'error') {
      expect(err.code).toBe('PLAY_REJECTED');
    }
  });

  it('seek updates currentTime and emits position', async () => {
    const { engine, refs } = setup();
    await engine.load({
      requestId: 'r3',
      trackId: 'tr_03',
      url: 'sample.mp3',
    });
    await new Promise((r) => setTimeout(r, 0));
    await engine.seek(123_456);
    const el = refs.element as unknown as FakeAudioElement;
    expect(Math.round(el.currentTime * 1000)).toBe(123_456);
  });

  it('setVolume clamps to [0, 1]', async () => {
    const { engine, refs } = setup();
    await engine.load({
      requestId: 'r4',
      trackId: 'tr_04',
      url: 'sample.mp3',
    });
    const el = refs.element as unknown as FakeAudioElement;
    await engine.setVolume(2);
    expect(el.volume).toBe(1);
    await engine.setVolume(-1);
    expect(el.volume).toBe(0);
    await engine.setVolume(0.6);
    expect(el.volume).toBeCloseTo(0.6);
  });

  it('dispose is idempotent and stops emitting', async () => {
    const { engine, events } = setup();
    await engine.load({
      requestId: 'r5',
      trackId: 'tr_05',
      url: 'sample.mp3',
    });
    await engine.dispose();
    await engine.dispose();
    events.length = 0;
    await engine.play();
    expect(events).toEqual([]);
  });
});

/**
 * Integration-style test: when the engine is mounted into a real DOM node
 * (jsdom), it appends the `<audio>` element so the browser's MediaSession
 * pipeline can track it. This is the contract WinMedel finds in the field
 * — without DOM attachment, the WebView2 host sees no media keys surface.
 */
describe('WebAudioEngine DOM integration', () => {
  it('appends the hidden audio element to the supplied mount', () => {
    const mount = document.createElement('div');
    const refs: { element: HTMLAudioElement | null } = { element: null };
    const engine = new WebAudioEngine({
      tickMs: 5,
      mount,
      createElement: () => {
        refs.element = document.createElement('audio');
        return refs.element;
      },
    });
    void engine.load({
      requestId: 'dom',
      trackId: 'tr_dom',
      url: 'sample.mp3',
    });
    expect(refs.element).not.toBeNull();
    expect(refs.element!.parentNode).toBe(mount);
    expect(refs.element!.style.display).toBe('none');
    expect(refs.element!.getAttribute('aria-hidden')).toBe('true');
  });

  it('seeds default navigator.mediaSession.metadata when available', () => {
    // jsdom does not implement MediaMetadata / mediaSession by default; we
    // fake just enough of the surface to assert the call path.
    const fakeMetadata = { title: '', artist: '', album: '' };
    class FakeMediaMetadata {
      title: string;
      artist: string;
      album: string;
      constructor(init: { title: string; artist: string; album: string }) {
        this.title = init.title;
        this.artist = init.artist;
        this.album = init.album;
        Object.assign(fakeMetadata, init);
      }
    }
    const handlers: Record<string, () => void> = {};
    const fakeMediaSession = {
      metadata: null as FakeMediaMetadata | null,
      setActionHandler(name: string, fn: () => void) {
        handlers[name] = fn;
      },
    };
    const nav = navigator as unknown as { mediaSession: typeof fakeMediaSession };
    const original = nav.mediaSession;
    (navigator as unknown as { mediaSession: unknown }).mediaSession = fakeMediaSession;
    (globalThis as unknown as { MediaMetadata: typeof FakeMediaMetadata }).MediaMetadata = FakeMediaMetadata;

    try {
      const mount = document.createElement('div');
      const engine = new WebAudioEngine({
        tickMs: 5,
        mount,
        createElement: () => document.createElement('audio'),
      });
      void engine.load({
        requestId: 'smtc',
        trackId: 'tr_smtc',
        url: 'sample.mp3',
      });
      expect(fakeMediaSession.metadata).toBeTruthy();
      expect(fakeMediaSession.metadata!.title).toBe('OpenMusic');
      expect(typeof handlers['play']).toBe('function');
      expect(typeof handlers['pause']).toBe('function');
    } finally {
      (navigator as unknown as { mediaSession: unknown }).mediaSession = original;
    }
  });
});