// Web Worker: runs parseWorkbook off the main thread
import { parseWorkbook } from './parseWorkbook'

self.onmessage = (e: MessageEvent<ArrayBuffer>) => {
  try {
    const result = parseWorkbook(e.data)
    self.postMessage({ ok: true, result })
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) })
  }
}
