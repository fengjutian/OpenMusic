/**
 * Composition-root tests (execution handbook §一阶段 1, items §1.7–§1.8).
 *
 * Goals:
 *   - The same `Services` instance is returned across renders.
 *   - `ServicesProvider` calls `start()` once on mount and `dispose()` once
 *     on unmount, never on re-render.
 *   - Re-mounting under Strict Mode (or back-to-back mounts) does not grow
 *     the engine listener count, so a real Android or Windows host cannot
 *     trip `MaxListenersExceededWarning` from our wiring.
 *   - `useServices()` throws outside a provider — no silent global fallback.
 *
 * The `MaxListenersExceededWarning` we see on every `npm run build` is in
 * fact printed by the rspeedy/rspack child process (not by OpenMusic code)
 * — see `docs/platform-capability-matrix.md` §3.0. These tests guard the
 * OpenMusic side; the toolchain warning is tracked separately.
 */

import { render } from '@lynx-js/react/testing-library';
import { beforeEach, describe, expect, it } from '@rstest/core';

import type { Services } from '../services.js';
import { createTestServices } from '../services.js';
import { ServicesProvider, useServices } from '../services-context.js';

function Probe({ onReady }: { onReady: (services: Services) => void }) {
  const services = useServices();
  onReady(services);
  return null;
}

/** Lightweight spy: wraps a method and counts calls. rstest ships no `vi`. */
function spyOnMethod(
  obj: Record<string, unknown>,
  key: string,
): { calls: number; restore(): void } {
  const original = obj[key] as (...a: unknown[]) => unknown;
  const wrapper = { calls: 0, restore() { obj[key] = original; } };
  obj[key] = (...args: unknown[]) => {
    wrapper.calls += 1;
    return original.apply(obj, args);
  };
  return wrapper;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('createTestServices', () => {
  it('builds a Services bag with the demo defaults', () => {
    const services = createTestServices();
    expect(services.usingMocks).toBe(true);
    expect(services.player).toBeDefined();
    expect(services.catalog).toBeDefined();
    expect(services.settings).toBeDefined();
    expect(typeof services.start).toBe('function');
    expect(typeof services.dispose).toBe('function');
  });

  it('honours per-port overrides', () => {
    const fakeSettings = {
      get: <T,>(_key: string, fallback: T): Promise<T> => Promise.resolve(fallback),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      keys: () => Promise.resolve([] as string[]),
    };
    const services = createTestServices({ settings: fakeSettings });
    expect(services.settings).toBe(fakeSettings);
  });
});

describe('useServices', () => {
  it('throws when no ServicesProvider is present', () => {
    expect(() => render(<Probe onReady={() => undefined} />)).toThrow(
      /useServices\(\) called outside <ServicesProvider>/,
    );
  });

  it('returns the same Services instance across renders', () => {
    const services = createTestServices();
    const seen: Services[] = [];
    const { rerender } = render(
      <ServicesProvider services={services}>
        <Probe onReady={(s) => seen.push(s)} />
      </ServicesProvider>,
    );
    rerender(
      <ServicesProvider services={services}>
        <Probe onReady={(s) => seen.push(s)} />
      </ServicesProvider>,
    );
    rerender(
      <ServicesProvider services={services}>
        <Probe onReady={(s) => seen.push(s)} />
      </ServicesProvider>,
    );

    expect(seen.length).toBeGreaterThan(0);
    for (const instance of seen) {
      expect(instance).toBe(services);
    }
  });
});

describe('ServicesProvider lifecycle', () => {
  it('calls start() exactly once on mount and dispose() exactly once on unmount', () => {
    const services = createTestServices();
    const startSpy = spyOnMethod(services as unknown as Record<string, unknown>, 'start');
    const disposeSpy = spyOnMethod(services as unknown as Record<string, unknown>, 'dispose');

    const view = render(
      <ServicesProvider services={services}>
        <Probe onReady={() => undefined} />
      </ServicesProvider>,
    );

    expect(startSpy.calls).toBe(1);
    expect(disposeSpy.calls).toBe(0);

    view.unmount();

    expect(startSpy.calls).toBe(1);
    expect(disposeSpy.calls).toBe(1);
    startSpy.restore();
    disposeSpy.restore();
  });

  it('does not re-start the PlayerCoordinator on re-render', () => {
    const services = createTestServices();
    const startSpy = spyOnMethod(services as unknown as Record<string, unknown>, 'start');

    const { rerender } = render(
      <ServicesProvider services={services}>
        <Probe onReady={() => undefined} />
      </ServicesProvider>,
    );
    rerender(
      <ServicesProvider services={services}>
        <Probe onReady={() => undefined} />
      </ServicesProvider>,
    );
    rerender(
      <ServicesProvider services={services}>
        <Probe onReady={() => undefined} />
      </ServicesProvider>,
    );

    expect(startSpy.calls).toBe(1);
    startSpy.restore();
  });

  it('keeps the engine listener set size stable across mount/unmount cycles', () => {
    const services = createTestServices();
    // Access the engine through the PlayerCoordinator. The fake engine keeps
    // a Set; touching it from a test pins the contract that `start()` adds
    // exactly one listener and `dispose()` removes it.
    const engine = services.player as unknown as {
      engine: { listeners: { size: number } };
    };
    const baseline = engine.engine.listeners.size;

    for (let i = 0; i < 5; i += 1) {
      const view = render(
        <ServicesProvider services={services}>
          <Probe onReady={() => undefined} />
        </ServicesProvider>,
      );
      view.unmount();
    }

    expect(engine.engine.listeners.size).toBe(baseline);
  });
});