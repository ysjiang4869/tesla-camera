import React from 'react'
import {
  Button,
  Tooltip,
} from '@fluentui/react-components'
import { ApprovalsApp24Regular } from '@fluentui/react-icons'
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
    <Tooltip content={`当前版本 v${pkgJson.version}，检查更新 `} relationship="label">
      <Button
        icon={<ApprovalsApp24Regular />}
        onClick={() => onCheck()}
      />
    </Tooltip>
  )
}

export default CheckUpdate
