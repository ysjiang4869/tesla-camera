import React from 'react'
import { Icons } from './icons'
import { topbarStyles } from './topbar-styles'
import pkgJson from '../../package.json'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { ask, message } from '@tauri-apps/plugin-dialog'

const CheckUpdate: React.FC = () => {
  const onCheck = async () => {
    try {
      const update = await check()
      if (!update) {
        await message('当前已是最新版本', { title: '检查更新' })
        return
      }
      const confirmed = await ask(
        `发现新版本 v${update.version}，是否立即下载并安装？`,
        { title: '检查更新' },
      )
      if (!confirmed) {
        return
      }
      await update.downloadAndInstall()
      await relaunch()
    } catch (e) {
      message(e instanceof Error ? e.message : JSON.stringify(e), {
        title: '更新发生错误',
        kind: 'error',
      })
    }
  }
  return (
    <button
      style={{ ...topbarStyles.btn, ...topbarStyles.iconOnly }}
      title={`当前版本 v${pkgJson.version}，检查更新`}
      type="button"
      onClick={() => onCheck()}
    >
      <Icons.Sync size={14} />
    </button>
  )
}

export default CheckUpdate
