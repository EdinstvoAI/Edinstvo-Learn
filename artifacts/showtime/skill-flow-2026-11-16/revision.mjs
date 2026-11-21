import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// Remove most of two recorded holds in the Lottie wave. Keep the moving frames
// and all other scenes at their original speed.
const holds = [[8.075, 9.003333, 0.75], [9.873333, 10.388333, 0.35]];
const summary = process.argv[2] === 'summary';
if (summary) holds.splice(0, holds.length,
  [6.076667, 7.27, 0.7], [9.143333, 10.4, 1.05],
  [11.086667, 11.685, 0.4], [11.685, 12.153333, 0.28]);
const start = summary ? 4.4 : 2.2;
const end = summary ? 29.25 : 27.5;
const prefix = summary ? 'summary' : 'revision';
const pts = holds.map(([from, to, removed]) =>
  `(${removed}/${to - from})*clip(T-${from},0,${to - from})`).join('-');
const totalRemoved = holds.reduce((sum, hold) => sum + hold[2], 0);
const filter = `setpts='(T-${pts})/TB',fps=60,trim=start=${start}:end=${end - totalRemoved},setpts=PTS-STARTPTS`;
const edit = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-n', '-i', summary ? 'summary-source.mp4' : 'revision2.mp4',
  '-vf', filter, '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '17', prefix + '-cut.mp4'], { stdio: 'inherit' });
if (edit.status !== 0) process.exit(edit.status ?? 1);
const responses = summary ? [5.917, 7.383] : [3.683, 6.233];
const events = [['answer', responses[0], 438], ['submit', responses[1], 580]].map(([id, response, y]) => ({
  id, type: 'tap', time: response - 0.06 - start - holds.filter(([, to]) => response >= to).reduce((sum, hold) => sum + hold[2], 0), x: 200, y, anchor_frame: 25,
}));
writeFileSync(prefix + '-cut-events.json', JSON.stringify({ coordinate_space: { width: 402, height: 874 }, events }, null, 2));
