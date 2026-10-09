/**
 * Seed catalogue used by the mock repository. Product spec §2 requires the app
 * to be explorable within 3 seconds of launch; spec §2 (technical) §9 stage A
 * asks for 8–12 compliant placeholder tracks.
 *
 * All titles, artists and albums are fictional. No third-party catalogue data.
 */

import type { LyricLine, Playlist, Track } from '../../domain/models.js';

function t(
  id: string,
  title: string,
  artist: string,
  album: string,
  durationMs: number,
  opts: { trackNo: number; year: number; genre: string; playable?: boolean; reason?: string },
): Track {
  return {
    id,
    title,
    artists: [{ id: `ar_${artist}`, name: artist }],
    album: {
      id: `al_${album}`,
      title: album,
      coverUrl: `asset://cover/${id}`,
      year: opts.year,
    },
    coverUrl: `asset://cover/${id}`,
    durationMs,
    playable: opts.playable ?? true,
    audioUrl: opts.playable === false ? undefined : `file:///music/${id}.mp3`,
    source: 'local',
    filePath: `/music/${id}.mp3`,
    sizeBytes: Math.round(durationMs * 16),
    trackNo: opts.trackNo,
    genre: opts.genre,
    unavailableReason: opts.reason,
  };
}

export const SEED_TRACKS: Track[] = [
  t('tr_01', '晚风经过操场', '林听白', '十七岁的夏天', 214_000, { trackNo: 1, year: 2021, genre: '华语流行' }),
  t('tr_02', '晚风经过操场（Live）', '林听白', '十七岁的夏天', 238_000, { trackNo: 2, year: 2021, genre: '华语流行' }),
  t('tr_03', '把雨声留在耳机里', '陆时野', '夜航船', 191_000, { trackNo: 1, year: 2023, genre: '民谣' }),
  t('tr_04', '城市边缘三公里', '陈屿', '城市边缘三公里', 252_000, { trackNo: 1, year: 2022, genre: '摇滚' }),
  t('tr_05', '没有寄出的信', '苏见微', '纸飞机', 205_000, { trackNo: 4, year: 2020, genre: '华语流行' }),
  t('tr_06', '凌晨四点的便利店', '老唐乐队', '不打烊', 178_000, { trackNo: 2, year: 2023, genre: '摇滚' }),
  t('tr_07', '把云折成纸飞机', '苏见微', '纸飞机', 196_000, { trackNo: 1, year: 2020, genre: '华语流行' }),
  t('tr_08', '骑车经过你的大学', '周与安', '十七岁的夏天', 224_000, { trackNo: 5, year: 2021, genre: '华语流行' }),
  t('tr_09', '钢琴与雨', '白鸟', '安静练习曲', 302_000, { trackNo: 1, year: 2019, genre: '古典' }),
  t('tr_10', '这首没有名字', '白鸟', '安静练习曲', 268_000, { trackNo: 2, year: 2019, genre: '古典' }),
  t('tr_11', '测试用损坏文件', '未知歌手', '录音残留', 0, {
    trackNo: 1,
    year: 2018,
    genre: '其他',
    playable: false,
    reason: '文件已损坏或不再可访问',
  }),
  t('tr_12', '副歌总是记不住', '陆时野', '夜航船', 207_000, { trackNo: 3, year: 2023, genre: '民谣' }),
];

export const SEED_PLAYLISTS: Playlist[] = [
  {
    id: 'pl_liked',
    title: '喜欢的音乐',
    description: '你在本地收藏的歌曲',
    coverUrl: 'asset://cover/tr_01',
    creatorName: 'OpenMusic',
    trackCount: SEED_TRACKS.filter((x) => x.playable).length,
  },
  {
    id: 'pl_night',
    title: '深夜通勤',
    description: '给末班地铁准备的安静歌单',
    coverUrl: 'asset://cover/tr_03',
    creatorName: '示例歌单',
    trackCount: 6,
  },
  {
    id: 'pl_focus',
    title: '写代码不慌',
    description: '没有人声，适合长时间专注',
    coverUrl: 'asset://cover/tr_09',
    creatorName: '示例歌单',
    trackCount: 4,
  },
];

export const SEED_LYRICS: Record<string, LyricLine[]> = {
  tr_01: [
    { startMs: 0, text: '词曲：陈叙' },
    { startMs: 8_000, text: '操场空着 风把铃声吹散', translation: 'The field is empty, the wind scatters the bell' },
    { startMs: 18_000, text: '我们踩着影子往回走' },
    { startMs: 30_000, text: '晚风经过操场 落在你肩上' },
    { startMs: 46_000, text: '这一句唱了很多年', translation: 'This line I have sung for many years' },
    { startMs: 64_000, text: '也没有等来一句回答' },
    { startMs: 92_000, text: '晚风经过操场 像什么都没发生' },
    { startMs: 128_000, text: '只有影子被拉得很长' },
    { startMs: 168_000, text: '（间奏）' },
    { startMs: 196_000, text: '晚风经过操场 我还在原地' },
  ],
  tr_03: [
    { startMs: 0, text: '纯音乐前奏' },
    { startMs: 12_000, text: '把雨声留在耳机里' },
    { startMs: 30_000, text: '世界就安静了三厘米' },
    { startMs: 52_000, text: '你说这样就听不见自己' },
    { startMs: 88_000, text: '把雨声留在耳机里 一直到天亮' },
  ],
};