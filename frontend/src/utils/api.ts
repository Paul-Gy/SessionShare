export type LogType =
  | 'user_join'
  | 'user_leave'
  | 'file_upload'
  | 'file_delete'
  | 'close'
export type FilesIndex = Record<string, UploadedFile>

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
