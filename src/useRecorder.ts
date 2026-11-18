import { useEffect, useRef, useState } from 'react'

const LIMIT = 180

export function useRecorder(onAudio: (blob: Blob) => void, onError: (message: string) => void) {
  const recorder = useRef<MediaRecorder | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const timeout = useRef<number | undefined>(undefined)
  const mounted = useRef(true)
  const [state, setState] = useState<'idle' | 'requesting' | 'recording'>('idle')
  const [elapsed, setElapsed] = useState(0)

  function stop() {
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      stop()
      recorder.current?.stream.getTracks().forEach(track => track.stop())
      window.clearInterval(timer.current)
      window.clearTimeout(timeout.current)
    }
  }, [])

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      onError('La grabación requiere un navegador compatible y HTTPS o localhost.')
      return
    }
    setState('requesting')
    let stream: MediaStream | undefined
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mounted.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      const active = new MediaRecorder(stream)
      const chunks: Blob[] = []
      let failed = false
      active.ondataavailable = event => {
        if (event.data.size) chunks.push(event.data)
      }
      active.onerror = () => {
        failed = true
        if (mounted.current) onError('La grabación se interrumpió. Inténtalo de nuevo.')
        stop()
      }
      active.onstop = () => {
        window.clearInterval(timer.current)
        window.clearTimeout(timeout.current)
        active.stream.getTracks().forEach(track => track.stop())
        recorder.current = null
        if (!mounted.current) return
        setState('idle')
        if (failed) return
        const blob = new Blob(chunks, { type: active.mimeType })
        if (blob.size) onAudio(blob)
        else onError('La grabación está vacía. Inténtalo de nuevo.')
      }
      active.start()
      recorder.current = active
      const started = performance.now()
      setElapsed(0)
      setState('recording')
      timer.current = window.setInterval(() => {
        setElapsed(Math.min(LIMIT, Math.floor((performance.now() - started) / 1000)))
      }, 200)
      // Leave room for the recorder to finalize its last audio frame.
      timeout.current = window.setTimeout(stop, LIMIT * 1000 - 250)
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop())
      if (!mounted.current) return
      setState('idle')
      const name = error instanceof DOMException ? error.name : ''
      if (name === 'NotAllowedError') {
        onError('Permiso de micrófono denegado. Actívalo en el navegador o carga un archivo.')
      } else if (name === 'NotFoundError') {
        onError('No se encontró un micrófono. Conecta uno o carga un archivo.')
      } else {
        onError('No se pudo abrir el micrófono. Comprueba que esté disponible.')
      }
    }
  }

  return { start, stop, state, elapsed }
}
