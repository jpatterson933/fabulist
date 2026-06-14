import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron'
import type { EventChannels, InvokeChannels, SendChannels } from '@shared/channels'

/**
 * Typed wrappers over Electron's stringly-typed IPC. Channel name, arguments,
 * and return type are checked against the maps in src/shared/channels.ts, so the
 * main handlers and the preload bridge cannot drift out of agreement.
 */

type Result<C extends keyof InvokeChannels> = ReturnType<InvokeChannels[C]>

/** Register a request/response handler whose signature matches the channel map. */
export function handle<C extends keyof InvokeChannels>(
  channel: C,
  fn: (
    event: IpcMainInvokeEvent,
    ...args: Parameters<InvokeChannels[C]>
  ) => Result<C> | Promise<Result<C>>
): void {
  ipcMain.handle(channel, (event, ...args) =>
    fn(event, ...(args as Parameters<InvokeChannels[C]>))
  )
}

/** Register a fire-and-forget listener whose signature matches the channel map. */
export function onSend<C extends keyof SendChannels>(
  channel: C,
  fn: (event: IpcMainEvent, ...args: Parameters<SendChannels[C]>) => void
): void {
  ipcMain.on(channel, (event, ...args) => fn(event, ...(args as Parameters<SendChannels[C]>)))
}

/** Push a typed event to the renderer, skipping destroyed web contents. */
export function emitEvent<C extends keyof EventChannels>(
  wc: WebContents,
  channel: C,
  ...args: Parameters<EventChannels[C]>
): void {
  if (!wc.isDestroyed()) wc.send(channel, ...args)
}
