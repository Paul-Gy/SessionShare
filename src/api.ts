export type LogType =
  | 'user_join'
  | 'user_leave'
  | 'file_upload'
  | 'file_delete'
  | 'close'

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

export interface LogEvent {
  type: LogType
  user: string
  file?: UploadedFile
  date: Date
}
