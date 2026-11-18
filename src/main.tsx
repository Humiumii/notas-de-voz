import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AudioLines, FileAudio, Mic, Square } from 'lucide-react'
import { useRecorder } from './useRecorder'
import './styles.css'

type AudioSource = { name: string; blob?: Blob; url?: string }
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
  }

  const recorder = useRecorder(blob => load({ name: 'Grabación del micrófono', blob }), setError)
  const recording = recorder.state === 'recording'
  const busy = recorder.state !== 'idle'

  return (
    <>
      <header className="top"><div className="wrap brand"><AudioLines aria-hidden="true" /> Notas de voz</div></header>
      <main className="wrap">
        <section className="intro">
          <h1>Una nota de voz</h1>
          <p>Graba o carga una nota corta para escucharla aquí.</p>
        </section>
        <div className="workspace">
          <section className="panel audio-panel" aria-labelledby="audio-title">
            <h2 id="audio-title">Audio de origen</h2>
            <p className="muted">Hasta 3 minutos · máximo 32 MB</p>
            <div className="actions">
              <button className="primary" disabled={recorder.state === 'requesting'} onClick={() => {
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
                    if (event.currentTarget.duration > 180 && Number.isFinite(event.currentTarget.duration)) {
                      setSource(null)
                      setError('La nota supera el límite de 3 minutos.')
                    }
                  }} />
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
