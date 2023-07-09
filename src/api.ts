export type LogContent =
  | { type: 'user_join' | 'user_leave' | 'close' }
  | { type: 'file_upload' | 'file_delete'; file: UploadedFile }
  | { type: 'message'; message: string }

export type LogEvent = LogContent & {
  user: string
  date: Date
}

export interface SessionClient {
  name?: string
  socket: WebSocket
  ip: string
  active: boolean
}

export interface UploadedFile {
  id: string
  name: string
  type?: string
  size: number
  encrypted: boolean
  lastUpdate: Date
}
