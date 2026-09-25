import { fetcher } from 'itty-fetcher'

export type FilesIndex = Record<string, UploadedFile>

export type LogContent =
  | { type: 'user_join' | 'user_leave' | 'close' }
  | { type: 'file_upload' | 'file_delete'; file: UploadedFile }
  | { type: 'message'; message: string; messageId: number }

export type LogEvent = LogContent & {
  id: string
  user: string
  date: Date
}

export interface UploadedFile {
  id: string
  name: string
  type?: string
  storageKey: string
  size: number
  updatedAt: Date
}

export const maxLogEntries = 15
export const maxUploadSize = 100 * 1024 * 1024
export const maxSessionFiles = 25

export function slugifyFile(filename: string): string {
  const dotfile = filename.startsWith('.')
  const base = dotfile ? filename.slice(1) : filename

  const i = base.lastIndexOf('.')
  const [name, rawExt] = i > 0 ? [base.slice(0, i), base.slice(i + 1)] : [base, '']

  const normalize = (value: string) =>
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()

  const slug = normalize(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const ext = normalize(rawExt).replace(/[^a-z0-9]/g, '')

  return `${dotfile ? '.' : ''}${slug || 'file'}${ext ? `.${ext}` : ''}`
}

export const http = fetcher(window.location.origin)
