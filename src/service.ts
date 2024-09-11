import type { Context } from 'koishi'
import { Service } from 'koishi'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Stream } from 'node:stream'
import { exists } from './utils'

const durationRegex = /^ *Duration: (\d+):(\d+):(\d+).(\d+),/m

export interface EncodeResult {
  output: Buffer
  duration: number | undefined
}

export class NTSilkService extends Service {
  constructor(
    ctx: Context,
    private binPath: string,
  ) {
    super(ctx, 'ntsilk', true)
  }

  encode = async (
    input:
      | string
      | Buffer
      | ArrayBuffer
      | Uint8Array
      | number[]
      | Stream
      | NodeJS.ArrayBufferView
      | Iterable<string | NodeJS.ArrayBufferView>
      | AsyncIterable<string | NodeJS.ArrayBufferView>,
  ) => {
    const tempDir = join(this.ctx.baseDir, 'temp', 'ntsilk')
    await mkdir(tempDir, {
      recursive: true,
    })

    let srcPath = join(tempDir, generateFilename())
    let deleteSrc = true
    const dstPath = join(tempDir, `${generateFilename()}.ntsilk`)

    // Detect input type
    if (typeof input === 'string') {
      srcPath = input
      deleteSrc = false
    } else if (Buffer.isBuffer(input)) {
      await writeFile(srcPath, input)
    } else if (input instanceof ArrayBuffer) {
      await writeFile(srcPath, Buffer.from(input))
    } else if (Array.isArray(input)) {
      await writeFile(srcPath, Buffer.from(input))
    } else {
      await writeFile(srcPath, input)
    }

    return new Promise<EncodeResult>((res, rej) => {
      execFile(
        this.binPath,
        ['-y', '-i', srcPath, '-f', 'ntsilk_s16le', dstPath],
        {},
        (err, _stdout, stderr) => {
          if (err) {
            // In fact it IS an error but @typescript-eslint doesn't know
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            rej(err)
            return
          }

          const capture = durationRegex.exec(stderr)
          const hrs = Number(capture?.[1]) || 0
          const min = Number(capture?.[2]) || 0
          const sec = Number(capture?.[3]) || 0
          const ms = Number(capture?.[4]) || 0

          void readFile(dstPath).then((output) =>
            res({
              output,
              duration: 3600000 * hrs + 60000 * min + 1000 * sec + ms,
              // waveAmplitudes: undefined,
            }),
          )
        },
      )
    }).finally(() => {
      if (deleteSrc)
        void exists(srcPath).then((x) => {
          if (x) void unlink(srcPath)
        })
      void exists(dstPath).then((x) => {
        if (x) void unlink(dstPath)
      })
    })
  }
}

export const generateFilename = () => randomBytes(16).toString('hex')
