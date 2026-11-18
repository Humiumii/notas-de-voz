export type Segment = { start: number; end: number; text: string }

export const example = {
  name: 'Ideas para el portafolio',
  url: import.meta.env.BASE_URL + 'ejemplo.mp3',
}

// Texto y marcas de tiempo revisados contra el audio sintético.
export const exampleSegments: Segment[] = [
  { start: 0, end: 2.31, text: 'Hoy anoté tres ideas para el portafolio.' },
  { start: 4.06, end: 7.39, text: 'Primero, grabar una nota corta después de cada reunión.' },
  { start: 9.10, end: 13.36, text: 'Después, revisar el texto con calma y guardar las ideas en Markdown.' },
]
