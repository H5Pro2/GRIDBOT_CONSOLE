import { useRef, useState } from 'react'

export function ShutdownButton({ english, onShutdown }: { english: boolean; onShutdown: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const title = english ? 'Do you want to quit Gridbot Console?' : 'Möchtest du die Gridbot Console beenden?'
  const close = () => { if (!busy) dialog.current?.close() }
  const shutdown = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/shutdown', { method: 'POST', headers: { 'X-Gridbot-Shutdown': 'confirm' } })
      if (!response.ok) throw new Error()
      const payload = await response.json()
      if (payload.stopped !== true) throw new Error()
      onShutdown()
    } catch {
      setError(english ? 'Shutdown could not be confirmed. Please check the terminal.' : 'Beenden konnte nicht bestätigt werden. Bitte das Terminal prüfen.')
      setBusy(false)
    }
  }
  return <>
    <button className="quit-button" type="button" aria-label={english ? 'Quit Gridbot Console' : 'Gridbot Console beenden'}
      title={english ? 'Quit Gridbot Console' : 'Gridbot Console beenden'}
      onClick={() => { setError(''); dialog.current?.showModal() }}>×</button>
    <dialog className="quit-dialog" ref={dialog} aria-labelledby="quit-title" aria-describedby="quit-info"
      onCancel={(event) => { if (busy) event.preventDefault() }}>
      <h2 id="quit-title">{title}</h2>
      <p id="quit-info">{english ? 'Open exchange orders remain unchanged.' : 'Offene Börsenorders bleiben bestehen.'}</p>
      {busy && <p role="status">{english ? 'Waiting for running checks to finish…' : 'Laufende Prüfungen werden abgeschlossen…'}</p>}
      {error && <p className="quit-error" role="alert">{error}</p>}
      <div className="quit-actions">
        <button type="button" autoFocus disabled={busy} onClick={close}>{english ? 'No' : 'Nein'}</button>
        <button className="quit-confirm" type="button" disabled={busy} onClick={() => void shutdown()}>{english ? 'Yes' : 'Ja'}</button>
      </div>
    </dialog>
  </>
}
