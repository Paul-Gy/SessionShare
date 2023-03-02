const adjectives = [
  'Adventurous',
  'Aggressive',
  'Agreeable',
  'Amused',
  'Angry',
  'Attractive',
  'Beautiful',
  'Brainy',
  'Brave',
  'Bright',
  'Busy',
  'Calm',
  'Careful',
  'Cautious',
  'Charming',
  'Clean',
  'Clever',
  'Colorful',
  'Combative',
  'Cooperative',
  'Courageous',
  'Crazy',
  'Curious',
  'Cute',
  'Dangerous',
  'Defeated',
  'Defiant',
  'Determined',
  'Disgusted',
  'Elegant',
  'Enchanting',
  'Encouraging',
  'Energetic',
  'Enthusiastic',
  'Evil',
  'Excited',
  'Famous',
  'Fancy',
  'Fantastic',
  'Friendly',
  'Funny',
  'Gentle',
  'Glorious',
  'Good',
  'Graceful',
  'Handsome',
  'Happy',
  'Healthy',
  'Helpful',
  'Important',
  'Perfectionist',
  'Powerful',
]

const animals = [
  'Beaver',
  'Cat',
  'Deer',
  'Elephant',
  'Fox',
  'Groundhog',
  'Horse',
  'Monkey',
  'Panda',
  'Pig',
  'Rabbit',
  'Raccoon',
  'Tiger',
  'Zebra',
]

export function readFile(file: Blob): Promise<ArrayBuffer> {
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

export function randomName() {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)]
  const animal = animals[Math.floor(Math.random() * animals.length)]

  return `${adjective} ${animal}`
}

export function formatBytes(bytes: number) {
  if (bytes === 0) {
    return '0 Bytes'
  }

  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))

  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i]
}
