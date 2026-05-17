import { useState } from 'react'
import { currentUser } from '../services/authService'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { getFirebaseDb } from '../config/firebase'

type Stars = 1 | 2 | 3 | 4 | 5

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [stars,   setStars]   = useState<Stars | null>(null)
  const [comment, setComment] = useState('')
  const [sent,    setSent]    = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!stars) return
    setLoading(true)
    try {
      await addDoc(collection(getFirebaseDb(), 'feedback'), {
        stars,
        comment: comment.trim() || null,
        userEmail: currentUser()?.email ?? null,
        createdAt: serverTimestamp(),
      })
      setSent(true)
    } catch {
      // tiha greška — ne blokiramo korisnika
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-title"
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      {/* Kartica */}
      <div
        className="relative w-full max-w-sm rounded-2xl shadow-2xl card-bg animate-fade-in"
        style={{ border: '1px solid var(--bd)' }}
      >
        {/* Zaglavlje */}
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--bd)' }}>
          <h2 id="feedback-title" className="font-semibold text-sm" style={{ color: 'var(--t1)' }}>
            Ocjenite ovu e-uslugu
          </h2>
          <button
            onClick={onClose}
            aria-label="Zatvori"
            className="text-xl leading-none hover:opacity-60"
            style={{ color: 'var(--t3)' }}
          >
            ×
          </button>
        </div>

        {sent ? (
          <div className="px-6 py-8 text-center">
            <div className="text-4xl mb-3">✓</div>
            <p className="font-medium" style={{ color: 'var(--t1)' }}>Hvala na povratnoj informaciji!</p>
            <p className="text-sm mt-1" style={{ color: 'var(--t3)' }}>Vaše mišljenje pomaže nam unaprijediti uslugu.</p>
            <button
              onClick={onClose}
              className="mt-5 btn-primary px-6 py-2 rounded-xl text-sm font-medium"
            >
              Zatvori
            </button>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            {/* Zvjezdice */}
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--t2)' }}>
                Koliko ste zadovoljni ovom uslugom?
              </p>
              <div className="flex gap-1" role="radiogroup" aria-label="Ocjena od 1 do 5 zvjezdica">
                {([1, 2, 3, 4, 5] as Stars[]).map(n => (
                  <button
                    key={n}
                    role="radio"
                    aria-checked={stars === n}
                    aria-label={`${n} ${n === 1 ? 'zvjezdica' : 'zvjezdice'}`}
                    onClick={() => setStars(n)}
                    className="text-2xl transition-transform hover:scale-110 focus:outline-none rounded"
                    style={{
                      color: stars !== null && n <= stars ? '#f59e0b' : 'var(--bd)',
                    }}
                  >
                    ★
                  </button>
                ))}
              </div>
              {stars && (
                <p className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
                  {['', 'Nezadovoljan/na', 'Djelomično zadovoljan/na', 'Niti zadovoljan/na niti nezadovoljan/na', 'Zadovoljan/na', 'Vrlo zadovoljan/na'][stars]}
                </p>
              )}
            </div>

            {/* Komentar */}
            <div>
              <label htmlFor="feedback-comment" className="text-xs font-medium block mb-1" style={{ color: 'var(--t2)' }}>
                Komentar <span style={{ color: 'var(--t4)' }}>(neobavezno)</span>
              </label>
              <textarea
                id="feedback-comment"
                value={comment}
                onChange={e => setComment(e.target.value.slice(0, 300))}
                rows={3}
                placeholder="Što biste poboljšali?"
                className="p-ring w-full border rounded-xl px-3 py-2 text-sm resize-none"
                style={{ borderColor: 'var(--bd)', backgroundColor: 'var(--s-rz)', color: 'var(--t1)' }}
              />
              <p className="text-right text-xs mt-0.5" style={{ color: 'var(--t4)' }}>{comment.length}/300</p>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!stars || loading}
              className="btn-primary w-full py-2.5 rounded-xl text-sm font-semibold"
            >
              {loading ? 'Šalje se...' : 'Pošalji ocjenu'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function Footer() {
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const year = new Date().getFullYear()

  return (
    <>
      <footer
        className="mt-auto border-t"
        style={{ borderColor: 'var(--bd)', backgroundColor: 'var(--s-cd)' }}
        role="contentinfo"
        aria-label="Podnožje stranice"
      >
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs" style={{ color: 'var(--t3)' }}>

            {/* Lijevo: institucija */}
            <div className="space-y-0.5">
              <p className="font-medium" style={{ color: 'var(--t2)' }}>
                Republika Hrvatska · Ministarstvo pravosuđa, uprave i digitalne transformacije
              </p>
              <p>Ulica grada Vukovara 49, 10 000 Zagreb · © {year} Sva prava pridržana</p>
            </div>

            {/* Desno: linkovi */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <button
                onClick={() => setFeedbackOpen(true)}
                className="underline hover:opacity-80 transition-opacity"
                style={{ color: 'var(--p-tx)' }}
                aria-label="Ocjenite ovu e-uslugu"
              >
                Ocjenite uslugu
              </button>
              <span aria-hidden="true">·</span>
              <a
                href="https://gov.hr/moja-uprava/pristupacnost/izjava-o-pristupacnosti/833"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:opacity-80 transition-opacity"
                style={{ color: 'var(--p-tx)' }}
              >
                Izjava o pristupačnosti
              </a>
              <span aria-hidden="true">·</span>
              <a
                href="mailto:dii@mpudi.hr"
                className="underline hover:opacity-80 transition-opacity"
                style={{ color: 'var(--p-tx)' }}
              >
                Kontakt
              </a>
            </div>
          </div>
        </div>
      </footer>

      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </>
  )
}
