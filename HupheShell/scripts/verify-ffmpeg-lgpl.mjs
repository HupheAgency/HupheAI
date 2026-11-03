#!/usr/bin/env node
/** Controleert dat de meegeleverde FFmpeg echt een LGPL-build is die zelfstandig werkt. Gebruik: node scripts/verify-ffmpeg-lgpl.mjs [map met ffmpeg] */
import { execFile } from 'node:child_process'
import { readdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const dir = resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'bin'))
const ffmpeg = join(dir, 'ffmpeg'), ffprobe = join(dir, 'ffprobe')
const problems = []
const check = (ok, text) => { console.log(`${ok ? 'OK    ' : 'FOUT  '}${text}`); if (!ok) problems.push(text) }
// Een schone omgeving: niets uit Homebrew of PATH mag nodig zijn.
const env = { PATH: '/usr/bin:/bin', HOME: process.env.HOME }
const out = async (file, args) => { const r = await run(file, args, { env, maxBuffer: 32 * 1024 * 1024 }); return r.stdout + r.stderr }

try { await stat(ffmpeg); await stat(ffprobe) } catch { console.error(`ffmpeg/ffprobe ontbreken in ${dir}`); process.exit(1) }

const version = await out(ffmpeg, ['-hide_banner', '-version'])
const configuration = version.match(/^configuration:(.*)$/m)?.[1] ?? ''
check(!/--enable-gpl\b/.test(configuration), 'gebouwd zonder --enable-gpl')
check(!/--enable-nonfree\b/.test(configuration), 'gebouwd zonder --enable-nonfree')
check(!/--enable-lib(x264|x265|xvid|fdk-aac)/.test(configuration), 'geen GPL/nonfree-codecbibliotheken in de configuratie')
check(/--enable-shared/.test(configuration), 'dynamisch gelinkt (--enable-shared)')
console.log(`      ${version.split('\n')[0]}`)

const license = await out(ffmpeg, ['-hide_banner', '-L']).catch(() => '')
check(/GNU Lesser General Public/.test(license) && !/GNU General Public License(?! v)/.test(license.replace(/Lesser General Public/g, '')), 'FFmpeg meldt zelf: LGPL')

const encoders = await out(ffmpeg, ['-hide_banner', '-encoders'])
check(!/\blibx26[45]\b/.test(encoders), 'geen libx264/libx265 beschikbaar')
check(/\bh264_videotoolbox\b/.test(encoders), 'macOS-hardware-encoder h264_videotoolbox beschikbaar')
check(/^\s*A\S*\s+aac\s/m.test(encoders), 'AAC-encoder beschikbaar')

// Alleen systeembibliotheken en bibliotheken naast het programma.
const files = [ffmpeg, ffprobe, ...(await readdir(join(dir, 'lib')).then(n => n.filter(x => x.endsWith('.dylib')).map(x => join(dir, 'lib', x))).catch(() => []))]
check(files.length > 2, `bibliotheken naast het programma gevonden (${files.length - 2})`)
for (const file of files) {
  const links = (await run('otool', ['-L', file])).stdout.split('\n').slice(1).map(l => l.trim().split(' ')[0]).filter(Boolean)
  const stray = links.filter(l => !/^(@rpath\/|@executable_path\/|\/usr\/lib\/|\/System\/)/.test(l))
  check(!stray.length, `${file.slice(dir.length + 1)}: alleen eigen en systeembibliotheken${stray.length ? ` (o.a. ${stray.slice(0, 3).join(', ')}${stray.length > 3 ? ` en ${stray.length - 3} andere` : ''})` : ''}`)
}

// Echt gebruik: een kort filmpje maken met de macOS-encoder en teruglezen.
const work = await mkdtemp(join(tmpdir(), 'huphe-lgpl-'))
try {
  const clip = join(work, 'proef.mp4')
  await out(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=s=320x180:r=25:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:d=1',
    '-c:v', 'h264_videotoolbox', '-b:v', '2M', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip])
  const probed = JSON.parse(await out(ffprobe, ['-v', 'error', '-show_streams', '-of', 'json', clip]))
  check(probed.streams.some(s => s.codec_name === 'h264') && probed.streams.some(s => s.codec_name === 'aac'), 'proefexport (H.264 + AAC) gemaakt en leesbaar')
} catch (error) { check(false, `proefexport mislukt: ${String(error.message).slice(0, 300)}`) } finally { await rm(work, { recursive: true, force: true }) }

console.log(problems.length ? `\n${problems.length} probleem/problemen: deze FFmpeg is NIET geschikt om mee te leveren.` : '\nAlles in orde: deze FFmpeg is geschikt om mee te leveren.')
process.exit(problems.length ? 1 : 0)
