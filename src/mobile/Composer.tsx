import { useEffect, useRef, useState } from 'react'
import { Icon } from '../desktop/Icons'
import { mobileApi, uploadMobileImage } from './client'

interface Draft { text: string; images: { id: string; name: string }[]; requestId?: string }
interface Receipt { status: 'delivered' | 'sending' | 'uncertain' | 'failed'; error?: string }
export default function Composer({ id, connected, running }: { id: string; connected: boolean; running: boolean }) {
  const storage = `mrmak.mobile.draft.${id}`
  const [draft, setDraft] = useState<Draft>(() => { try { return JSON.parse(localStorage.getItem(storage) || '') } catch { return { text: '', images: [] } } })
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [status, setStatus] = useState(''), [uncertain, setUncertain] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  useEffect(() => { localStorage.setItem(storage, JSON.stringify(draft)) }, [draft, storage])
  async function send() {
    if (busy || uploading || !connected || !running || (!draft.text.trim() && !draft.images.length)) return
    const pending = { ...draft, requestId: draft.requestId || crypto.randomUUID() }
    setDraft(pending); localStorage.setItem(storage, JSON.stringify(pending)); setBusy(true); setStatus('Delivering…')
    try {
      const receipt = await mobileApi<Receipt>(`/sessions/${id}/send`, { requestId: pending.requestId, text: pending.text, images: pending.images.map(image => image.id) })
      if (receipt.status === 'delivered') { setDraft({ text: '', images: [] }); setStatus('Delivered to terminal'); setUncertain(false) }
      else { setStatus(receipt.error || 'Delivery is still being checked.'); setUncertain(receipt.status === 'uncertain' || receipt.status === 'failed') }
    } catch (error) { setStatus(`${error instanceof Error ? error.message : String(error)} Your draft is saved. Retry checks the same delivery.`) }
    finally { setBusy(false) }
  }
  async function attach(files: File[]) {
    if (!files.length || uploading || draft.requestId) return
    if (draft.images.length + files.length > 12) { setStatus('Attach up to 12 images per message.'); return }
    setUploading(true); setStatus('Saving images to your computer…')
    try { for (const file of files) { const image = await uploadMobileImage(file); setDraft(current => ({ ...current, images: [...current.images, image] })) }; setStatus('Images ready to send') }
    catch (error) { setStatus(error instanceof Error ? error.message : String(error)) }
    finally { setUploading(false); if (picker.current) picker.current.value = '' }
  }
  return <form className="mobile-composer" onSubmit={event => { event.preventDefault(); void send() }}>
    {!!draft.images.length && <div className="mobile-image-chips">{draft.images.map(image => <span key={image.id}><Icon name="attach" size={13} /><span>{image.name}</span><button type="button" aria-label={`Remove ${image.name}`} disabled={busy || !!draft.requestId} onClick={() => setDraft(current => ({ ...current, images: current.images.filter(item => item.id !== image.id) }))}>×</button></span>)}</div>}
    <textarea aria-label="Message this chat" placeholder={running ? 'Send a thought or a task…' : 'Draft a message · resume this chat to send'} rows={2} value={draft.text} disabled={busy || !!draft.requestId} onChange={event => setDraft(current => ({ ...current, text: event.target.value }))} onPaste={event => { const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/')); if (files.length) { event.preventDefault(); void attach(files) } }} />
    <div className="mobile-compose-actions"><input ref={picker} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={event => void attach(Array.from(event.target.files || []))} /><button type="button" className="mobile-icon" aria-label="Attach images" disabled={!connected || uploading || busy || !!draft.requestId} onClick={() => picker.current?.click()}><Icon name="attach" /></button><span>{connected ? running ? 'Your draft stays on this phone' : 'Chat is stopped' : 'Offline · draft saved'}</span><button className="mobile-send" type="submit" disabled={!connected || !running || uploading || busy || uncertain || (!draft.text.trim() && !draft.images.length)}><Icon name="send" size={17} />{busy ? 'Sending…' : draft.requestId ? 'Retry' : 'Send'}</button></div>
    {status && <div className="mobile-send-status" role="status">{status}{draft.requestId && !busy && <button type="button" onClick={() => { if (!window.confirm('Check the terminal first: your previous message may already have arrived. Start a new delivery attempt with this draft?')) return; setDraft(current => ({ text: current.text, images: current.images })); setUncertain(false); setStatus('Draft unlocked. Check the terminal before sending again.') }}>Edit draft</button>}</div>}
  </form>
}
