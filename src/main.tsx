import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AudioLines, FileAudio, Mic, Square } from 'lucide-react'
import { useRecorder } from './useRecorder'
import './styles.css'

type AudioSource = { name: string; blob?: Blob; url?: string }
type Segment = { start: number; end: number; text: string }
const example: AudioSource = {
  name: 'Ideas para el portafolio',
  url: import.meta.env.BASE_URL + 'ejemplo.mp3',
}

function clock(seconds: number) {
  const whole = Math.floor(seconds)
  return [Math.floor(whole / 60), whole % 60].map(n => String(n).padStart(2, '0')).join(':')
}

function App() {
  const [source, setSource] = useState<AudioSource | null>(null)
  const [playback, setPlayback] = useState('')
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [segments, setSegments] = useState<Segment[]>([])

  useEffect(() => {
    if (!source?.blob) {
      setPlayback(source?.url ?? '')
      return
    }
    const url = URL.createObjectURL(source.blob)
    setPlayback(url)
    return () => URL.revokeObjectURL(url)
  }, [source])

  function load(next: AudioSource) {
    setError('')
    if (next.blob && (!next.blob.size || next.blob.size > 32 * 1024 * 1024)) {
      setError('El archivo debe contener audio y pesar como máximo 32 MB.')
      return
    }
    setSource(next)
    setSegments([])
  }

  async function transcribe() {
    if (!source) return
    setProcessing(true)
    setError('')
    try {
      const blob: Blob = source.blob ?? await fetch(example.url!).then(response => {
        if (!response.ok) throw new Error('No se pudo cargar la nota de ejemplo.')
        return response.blob()
      })
      const form = new FormData()
      form.append('audio', blob, blob instanceof File ? blob.name : 'nota')
      const response = await fetch('/api/transcribir', { method: 'POST', body: form })
      const result = await response.json().catch(() => null)
      if (!response.ok || !Array.isArray(result?.segments)) {
        throw new Error(typeof result?.detail === 'string' ? result.detail : 'La API local no responde. Comprueba que esté en ejecución.')
      }
      setSegments(result.segments)
    } catch (error) {
      setError(error instanceof TypeError ? 'No se pudo conectar con la API local.' : (error as Error).message)
    } finally {
      setProcessing(false)
    }
  }

  const recorder = useRecorder(blob => load({ name: 'Grabación del micrófono', blob }), setError)
  const recording = recorder.state === 'recording'
  const busy = recorder.state !== 'idle' || processing

  return (
    <>
      <header className="top"><div className="wrap brand"><AudioLines aria-hidden="true" /> Notas de voz</div></header>
      <main className="wrap">
        <section className="intro">
          <h1>Una nota de voz</h1>
          <p>Graba o carga una nota corta y conviértela en texto en español.</p>
        </section>
        <div className="workspace">
          <section className="panel audio-panel" aria-labelledby="audio-title">
            <h2 id="audio-title">Audio de origen</h2>
            <p className="muted">Hasta 3 minutos · máximo 32 MB</p>
            <div className="actions">
              <button className="primary" disabled={recorder.state === 'requesting' || processing} onClick={() => {
                setError('')
                if (recording) recorder.stop()
                else void recorder.start()
              }}>
                {recording ? <Square /> : <Mic />}
                {recording ? `Detener · ${clock(recorder.elapsed)}` : 'Grabar audio'}
              </button>
              <label className="file-button">
                <FileAudio />
                Cargar archivo
                <input type="file" accept="audio/*,.webm,.mp4,.m4a,.ogg" disabled={busy} onChange={event => {
                  const file = event.currentTarget.files?.[0]
                  if (file) load({ name: file.name, blob: file })
                  event.currentTarget.value = ''
                }} />
              </label>
              <button className="text-button" disabled={busy} onClick={() => load(example)}>Usar nota de ejemplo</button>
            </div>
            {recorder.state === 'requesting' && <p role="status">Esperando permiso para usar el micrófono…</p>}
            {error && <p className="error" role="alert">{error}</p>}
            {playback && (
              <div className="player">
                <strong>{source?.name}</strong>
                <audio key={playback} src={playback} controls preload="metadata" aria-label="Reproductor de la nota"
                  onError={() => setError('El navegador no pudo reproducir este archivo. Prueba con MP3 o WAV.')}
                  onLoadedMetadata={event => {
                    if (!processing && event.currentTarget.duration > 180 && Number.isFinite(event.currentTarget.duration)) {
                      setSource(null)
                      setError('La nota supera el límite de 3 minutos.')
                    }
                  }} />
                <button className="primary transcribe-button" disabled={busy} onClick={() => void transcribe()}>Transcribir</button>
              </div>
            )}
          </section>
          <section className="panel" aria-labelledby="transcript-title">
            <h2 id="transcript-title">Transcripción</h2>
            <p role="status" className="muted">
              {processing ? 'Transcribiendo en español. La primera carga del modelo puede tardar unos minutos…' :
                segments.length ? `${segments.length} segmentos` : 'Selecciona una nota y pulsa Transcribir.'}
            </p>
            {segments.map(segment => (
              <p key={segment.start}><strong>{clock(segment.start)}</strong> {segment.text}</p>
            ))}
          </section>
        </div>
      </main>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
