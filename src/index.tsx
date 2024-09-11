import type {} from '@koishijs/plugin-notifier'
import envPaths from 'env-paths'
import type { Context } from 'koishi'
import { Schema } from 'koishi'
import { createWriteStream } from 'node:fs'
import { mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { arch, platform } from 'node:process'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import type { ReadableStream } from 'stream/web'
import { NTSilkService } from './service'
import { exists } from './utils'

export const name = 'ntsilk'

export const inject = {
  required: ['notifier'],
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Config {}

export const Config: Schema<Config> = Schema.object({})

const binSuffix = platform === 'win32' ? '.exe' : ''
const binName = `ntsilk-v1.0.1-${platform}-${arch}${binSuffix}`

export async function apply(ctx: Context) {
  const l = ctx.logger('ntsilk')

  const binDir = envPaths('koishi-plugin-ntsilk', {
    suffix: '',
  }).data
  const binPath = join(binDir, `${binName}`)

  await mkdir(binDir, {
    recursive: true,
  })
  const binExists = await exists(binPath)

  if (!binExists) {
    const notifier = ctx.notifier.create()

    const state: RenderProps = {
      status: 'check',
    }

    const update = () => {
      notifier.update({
        type: state.status !== 'failed' ? 'warning' : 'danger',
        content: render(state),
      })
    }

    update()

    try {
      const controller = new AbortController()
      const signal = controller.signal
      const response = await fetch(`https://ntsilk.ilharper.com/${binName}`, {
        signal,
      })

      if (response.status !== 200) {
        controller.abort()

        state.status = response.status === 404 ? 'unavailable' : 'failed'
        update()

        return
      }

      state.status = 'download'
      update()

      await finished(
        Readable.fromWeb(response.body as ReadableStream).pipe(
          createWriteStream(binPath),
        ),
      )

      notifier.dispose()
    } catch (e) {
      l.error(e)

      state.status = 'failed'
      update()

      // 执行清理
      if (await exists(binPath)) {
        unlink(binPath).catch(() => {
          // Ignore
        })
      }

      return
    }
  }

  ctx.plugin(NTSilkService, binPath)
}

interface RenderProps {
  status: 'check' | 'download' | 'unavailable' | 'failed'
}

function render(props: RenderProps) {
  switch (props.status) {
    case 'check':
      return (
        <>
          <p>正在检查……</p>
        </>
      )

    case 'download':
      return (
        <>
          <p>正在下载……</p>
        </>
      )

    case 'unavailable':
      return (
        <>
          <p>NTSilk 目前不适用于你的设备。</p>
        </>
      )

    case 'failed':
      return (
        <>
          <p>下载失败。</p>
        </>
      )
  }
}
