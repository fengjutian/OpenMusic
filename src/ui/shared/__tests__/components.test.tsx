import { render } from '@lynx-js/react/testing-library';
import { describe, expect, it, beforeEach } from '@rstest/core';

import { ThemeProvider } from '../theme.js';
import { TrackRow } from '../media.jsx';
import { EmptyState, ErrorState } from '../states.js';
import { AppError } from '../../../domain/errors.js';
import type { Track } from '../../../domain/models.js';

function track(overrides: Partial<Track> = {}): Track {
  return {
    id: 'tr_1',
    title: '晚风经过操场',
    artists: [{ id: 'ar_1', name: '林听白' }],
    durationMs: 214_000,
    playable: true,
    audioUrl: 'file:///music/tr_1.mp3',
    source: 'local',
    ...overrides,
  };
}

function renderWithTheme(node: Parameters<typeof render>[0]) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

describe('TrackRow', () => {
  beforeEach(() => {
    // Long titles must not break layout assertions.
    document.body.innerHTML = '';
  });

  it('renders the title and artists', () => {
    const { container } = renderWithTheme(<TrackRow track={track()} />);
    expect(container.textContent).toContain('晚风经过操场');
    expect(container.textContent).toContain('林听白');
    expect(container.textContent).toContain('3:34');
  });

  it('explains why an unplayable track cannot be played', () => {
    const { container } = renderWithTheme(
      <TrackRow
        track={track({ playable: false, audioUrl: undefined, unavailableReason: '文件已损坏或不再可访问' })}
      />,
    );
    expect(container.textContent).toContain('文件已损坏或不再可访问');
    // An unplayable row must not show a duration it does not have.
    expect(container.textContent).toContain('--:--');
  });

  it('handles a very long title without dropping the artist line', () => {
    const long = '这是一个非常非常长的歌曲名字'.repeat(4);
    const { container } = renderWithTheme(<TrackRow track={track({ title: long })} />);
    expect(container.textContent).toContain(long);
    expect(container.textContent).toContain('林听白');
  });
});

describe('async states', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('empty state shows the action only when a handler is supplied', () => {
    const withoutAction = renderWithTheme(<EmptyState title="音乐库还是空的" />);
    expect(withoutAction.container.textContent).toContain('音乐库还是空的');
    expect(withoutAction.queryByTestId('empty-state-action')).toBeNull();

    const withAction = renderWithTheme(
      <EmptyState title="音乐库还是空的" actionLabel="去扫描音乐" onAction={() => undefined} />,
    );
    expect(withAction.queryByTestId('empty-state-action')).not.toBeNull();
  });

  it('error state shows the localised user message, not the debug detail', () => {
    const { container } = renderWithTheme(
      <ErrorState error={new AppError('network', '网络不太顺畅，请稍后重试', { debugDetail: 'ECONNRESET' })} />,
    );
    expect(container.textContent).toContain('网络不太顺畅，请稍后重试');
    expect(container.textContent).not.toContain('ECONNRESET');
  });
});