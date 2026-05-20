import type { ParsedWorkbook } from './parseWorkbook'

export function parseWorkbookInWorker(buffer: ArrayBuffer): Promise<ParsedWorkbook> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./parseWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e) => {
      worker.terminate()
      if (e.data.ok) resolve(e.data.result as ParsedWorkbook)
      else reject(new Error(e.data.error))
    }
    worker.onerror = (err) => { worker.terminate(); reject(err) }
    worker.postMessage(buffer, [buffer])
  })
}
