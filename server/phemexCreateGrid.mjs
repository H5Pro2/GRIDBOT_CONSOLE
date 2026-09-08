import { createPhemexMonitorHandler } from './phemexMonitor.mjs'

export function createPhemexCreateGridHandler(dependencies) {
  return createPhemexMonitorHandler({ ...dependencies, mode: 'create' })
}
