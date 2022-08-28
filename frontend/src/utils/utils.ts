// from Bootstrap Icons
const supportedFileIcons = [
  'aac',
  'ai',
  'bmp',
  'cs',
  'css',
  'csv',
  'doc',
  'docx',
  'exe',
  'gif',
  'heic',
  'html',
  'java',
  'jpg',
  'js',
  'json',
  'jsx',
  'key',
  'm4p',
  'md',
  'mdx',
  'mov',
  'mp3',
  'mp4',
  'otf',
  'pdf',
  'php',
  'png',
  'ppt',
  'pptx',
  'psd',
  'py',
  'raw',
  'rb',
  'sass',
  'scss',
  'sh',
  'sql',
  'svg',
  'tiff',
  'tsx',
  'ttf',
  'txt',
  'wav',
  'woff',
  'xls',
  'xlsx',
  'xml',
  'yml',
]

export async function readFile(file: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.readAsArrayBuffer(file)
  })
}

export function downloadBlob(data: BlobPart, name: string, type: string): void {
  const blob = new Blob([data], { type })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.style.display = 'none'
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  window.URL.revokeObjectURL(url)
}

export function filetypeIconExists(extension: string) {
  return supportedFileIcons.includes(extension)
}

export function formatBytes(bytes: number) {
  if (bytes === 0) {
    return '0 Bytes'
  }

  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))

  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i]
}
