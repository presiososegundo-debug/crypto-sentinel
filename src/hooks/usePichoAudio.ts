/**
 * usePichoAudio — Web Audio API
 * Acorde armónico C5-E5-G5 con lock de reproducción (máx 2 por señal)
 */
import { useRef, useState, useCallback } from 'react'

const C5 = 523.25
const E5 = 659.25
const G5 = 783.99

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

function playChord(volume: number) {
  const ctx  = getCtx()
  const master = ctx.createGain()
  master.gain.setValueAtTime(0, ctx.currentTime)
  master.gain.linearRampToValueAtTime(volume * 0.18, ctx.currentTime + 0.04)
  master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.4)
  master.connect(ctx.destination)

  ;[C5, E5, G5].forEach(freq => {
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, ctx.currentTime)
    gain.gain.setValueAtTime(1, ctx.currentTime)
    osc.connect(gain)
    gain.connect(master)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 1.5)
  })
}

export function usePichoAudio() {
  const [volume, setVolume]   = useState(0.8)        // 0 = mute, 1 = max
  const [muted, setMuted]     = useState(false)
  const prevScoreRef          = useRef<number | null>(null)
  const playsRef              = useRef(0)

  const playPichoAlert = useCallback((score: number) => {
    if (muted || volume === 0) return

    // Nueva señal → reset contador
    if (score !== prevScoreRef.current) {
      prevScoreRef.current = score
      playsRef.current     = 0
    }

    if (playsRef.current >= 2) return   // máx 2 reproducciones por señal
    playsRef.current++

    // Desbloquear AudioContext en Safari/Chrome (necesita gesto de usuario)
    const ctx = getCtx()
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => playChord(volume))
    } else {
      playChord(volume)
    }
  }, [muted, volume])

  const toggleMute = useCallback(() => setMuted(m => !m), [])

  const adjustVolume = useCallback((delta: number) => {
    setVolume(v => Math.min(1, Math.max(0, parseFloat((v + delta).toFixed(2)))))
    setMuted(false)
  }, [])

  return { playPichoAlert, volume, muted, toggleMute, adjustVolume }
}
