import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AudioLines, Download, FileAudio, Mic, Play, Square } from 'lucide-react'
import { useRecorder } from './useRecorder'
import './styles.css'

type AudioSource = { name: string } & ({ blob: Blob; url?: never } | { url: string; blob?: never })
type Segment = { start: number; end: number; text: string }
const example = {
  name: 'Ideas para el portafolio',
  url: import.meta.env.BASE_URL + 'ejemplo.mp3',
}

function clock(seconds: number) {
  const whole = Math.floor(seconds)
  return [Math.floor(whole / 60), whole % 60].map(n => String(n).padStart(2, '0')).join(':')
}

function preciseTime(seconds: number) {
  const ms = Math.round(seconds * 1000)
  return `${clock(ms / 1000)}.${String(ms % 1000).padStart(3, '0')}`
}

function downloadMarkdown(segments: Segment[]) {
  const sections = segments.map(({ start, end, text }) =>
    `## ${preciseTime(start)} – ${preciseTime(end)}\n\n${text.trim()}`,
  )
  const blob = new Blob([`# Nota de voz\n\n${sections.join('\n\n')}\n`], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'nota-de-voz.md'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function App() {
  const [source, setSource] = useState<AudioSource | null>(null)
  const [playback, setPlayback] = useState('')
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [segments, setSegments] = useState<Segment[]>([])
  const [position, setPosition] = useState(0)
  const [canSeek, setCanSeek] = useState(false)
  const audio = useRef<HTMLAudioElement>(null)

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
    if (source === next) return
    setSource(next)
    setSegments([])
    setPosition(0)
    setCanSeek(false)
  }

  async function transcribe() {
    if (!source) return
    setProcessing(true)
    setError('')
    try {
      const blob: Blob = source.blob ?? await fetch(source.url).then(response => {
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

  function jumpTo(start: number) {
    if (!audio.current) return
    audio.current.currentTime = start
    setPosition(start)
    void audio.current.play().catch(() => setError('No se pudo iniciar el audio. Usa los controles del reproductor.'))
  }

  return (
    <>
      <header className="top"><div className="wrap brand"><AudioLines aria-hidden="true" /> Notas de voz</div></header>
      <main className="wrap">
        <section className="intro">
          <h1>De voz a texto.</h1>
          <p>Transcribe notas cortas en español, corrige y exporta a Markdown.</p>
        </section>
        <div className="workspace">
          <section className="panel source-panel" aria-labelledby="audio-title">
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
            {source && <button className="primary transcribe-button" disabled={busy || segments.length > 0}
              onClick={() => void transcribe()}>{processing ? 'Transcribiendo…' : segments.length ? 'Nota transcrita' : 'Transcribir'}</button>}
          </section>
          {playback && (
            <section className="panel player" aria-label="Reproductor">
              <div className="track-name"><AudioLines aria-hidden="true" /> <strong>{source?.name}</strong></div>
              <audio key={playback} ref={audio} src={playback} controls preload="metadata" aria-label="Reproductor de la nota"
                onTimeUpdate={event => setPosition(event.currentTarget.currentTime)}
                onError={() => {
                  setCanSeek(false)
                  setError('El navegador no pudo reproducir este archivo. Prueba con MP3 o WAV.')
                }}
                onLoadedMetadata={event => {
                  const duration = event.currentTarget.duration
                  if (!processing && Number.isFinite(duration) && duration > 180) {
                    setSource(null)
                    setSegments([])
                    setError('La nota supera el límite de 3 minutos.')
                  } else {
                    setCanSeek(true)
                  }
                }} />
            </section>
          )}
          <section className="panel transcript" aria-labelledby="transcript-title">
            <div className="transcript-header">
              <h2 id="transcript-title">Transcripción</h2>
              <button disabled={!segments.length} onClick={() => downloadMarkdown(segments)}>
                <Download /> Descargar Markdown
              </button>
            </div>
            <p role="status" className="muted">
              {processing ? 'Transcribiendo en español. La primera carga del modelo puede tardar unos minutos…' :
                segments.length ? `${segments.length === 1 ? '1 segmento' : `${segments.length} segmentos`}. Pulsa un tiempo para escuchar y edita el texto.` :
                'Selecciona una nota y pulsa Transcribir.'}
            </p>
            {segments.length > 0 && <ol className="segments">
              {segments.map((segment, index) => {
                const active = position >= segment.start && position < segment.end
                return (
                  <li key={index} className={active ? 'segment active' : 'segment'}>
                    <button className="timestamp" disabled={!canSeek} aria-current={active ? 'true' : undefined}
                      aria-label={`Escuchar segmento ${index + 1} desde ${preciseTime(segment.start)}`}
                      onClick={() => jumpTo(segment.start)}>
                      <Play aria-hidden="true" /> {clock(segment.start)}
                    </button>
                    <textarea aria-label={`Texto del segmento ${index + 1}`} rows={2} value={segment.text}
                      onChange={event => {
                        const text = event.currentTarget.value
                        setSegments(items => items.map((item, i) => i === index ? { ...item, text } : item))
                      }} />
                  </li>
                )
              })}
            </ol>}
          </section>
        </div>
      </main>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
