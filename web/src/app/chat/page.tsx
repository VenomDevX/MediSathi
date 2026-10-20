'use client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowUp, ChatCircleText, Microphone, Plus, SpeakerHigh, Stop, Trash } from '@phosphor-icons/react'
import { useApp } from '@/app-context'
import { composeAnswer, planReply } from '@/assistant/answer'
import { addMessage, createChat, deleteChat, listChats, listMessages, type Message, type Source } from '@/data/chats'
import { emergencyRules } from '@/emergencyRules'
import { useLang, useT } from '@/i18n'
import { canListen, listen } from '@/platform/listen'
import { canSpeak, speak, stopSpeaking } from '@/platform/speech'
import type { StringKey } from '@/strings'
import { EmergencyCard } from '@/ui/EmergencyCard'
import { AssistantMark, cx } from '@/ui/components'
import { useAsync } from '@/ui/useAsync'

const suggestions: StringKey[] = ['suggestFever', 'suggestBurn', 'suggestDiarrhoea', 'suggestHeat']

function Chat() {
  const t = useT()
  const { lang } = useLang()
  const { db, boot, whenReady } = useApp()
  const ready = boot.status === 'ready'
  const params = useSearchParams()
  const [chatId, setChatId] = useState<string | null>(params.get('id'))
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState<null | (() => void)>(null)
  const [can, setCan] = useState({ listen: false, speak: false })
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { data: chats, reload: reloadChats } = useAsync((d) => listChats(d), [])

  useEffect(() => setCan({ listen: canListen(), speak: canSpeak() }), [])

  // Open a chat from the URL (or a fresh one when the id goes away, e.g. "New chat").
  const urlId = params.get('id')
  useEffect(() => {
    setChatId(urlId)
    if (!urlId) return setMessages([])
    if (ready) void listMessages(db, urlId).then(setMessages)
  }, [urlId, db, ready])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' }) // braces: Chromium's scroll methods now return a Promise
  }, [messages, busy])

  async function send(question: string) {
    const q = question.trim()
    if (!q || busy) return
    setText('')
    setBusy(true)
    try {
      await whenReady // first launch seeds the library; a question asked meanwhile waits rather than finding nothing
      let id = chatId
      if (!id) {
        id = await createChat(db, q)
        setChatId(id)
        history.replaceState(null, '', `/chat/?id=${id}`)
      }
      await addMessage(db, id, { role: 'user', content: q })
      const plan = await planReply(db, emergencyRules, q, lang)
      if (plan.kind === 'emergency')
        await addMessage(db, id, { role: 'assistant', kind: 'emergency', content: plan.rule.instruction[lang], sources: [{ id: plan.rule.id, title: plan.rule.title[lang] }] })
      else if (plan.kind === 'grounded')
        await addMessage(db, id, { role: 'assistant', kind: 'composed', content: composeAnswer(plan.sources, lang), sources: plan.sources.map((s) => ({ id: s.id, title: s.title })) })
      else await addMessage(db, id, { role: 'assistant', kind: 'unknown', content: t('chatUnknown') })
      setMessages(await listMessages(db, id))
      reloadChats()
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void send(text)
  }

  function toggleListen() {
    if (listening) return listening()
    const stop = listen(lang, setText, () => setListening(null))
    setListening(() => stop)
  }

  function toggleSpeak(m: Message) {
    stopSpeaking()
    if (speakingId === m.id) return setSpeakingId(null)
    setSpeakingId(m.id)
    speak(m.content, lang, () => setSpeakingId(null))
  }

  async function remove(id: string) {
    await deleteChat(db, id)
    reloadChats()
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="display text-[26px]">{t('chatTitle')}</h1>
        {chatId && (
          <Link href="/chat/" className="flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] px-3 font-semibold text-neel hover:bg-neel-soft">
            <Plus size={18} weight="bold" aria-hidden />
            {t('chatNew')}
          </Link>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-5" aria-live="polite">
        {messages.length === 0 && !busy && (
          <div className="flex flex-col gap-6">
            <p className="flex items-start gap-3 text-lg">
              <AssistantMark className="mt-2.5" />
              {t('chatHello')}
            </p>
            <ul className="flex flex-wrap gap-2">
              {suggestions.map((k) => (
                <li key={k}>
                  <button type="button" onClick={() => void send(t(k))} className="min-h-11 rounded-full border border-line bg-surface px-4 hover:border-neel">
                    {t(k)}
                  </button>
                </li>
              ))}
            </ul>
            {!!chats?.length && (
              <section aria-labelledby="history">
                <h2 id="history" className="mb-2 font-semibold text-muted">{t('chatHistory')}</h2>
                <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
                  {chats.slice(0, 10).map((c) => (
                    <li key={c.id} className="flex items-center">
                      <Link href={`/chat/?id=${c.id}`} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 hover:bg-canvas">
                        <ChatCircleText size={20} className="shrink-0 text-muted" aria-hidden />
                        <span className="truncate">{c.title}</span>
                      </Link>
                      <button type="button" onClick={() => void remove(c.id)} aria-label={`${t('chatDelete')}: ${c.title}`} className="flex size-14 shrink-0 items-center justify-center text-muted hover:text-danger">
                        <Trash size={20} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {messages.map((m) =>
          m.role === 'user' ? (
            <p key={m.id} className="max-w-[85%] self-end rounded-[var(--radius-card)] rounded-br-md bg-neel-soft px-4 py-2.5 whitespace-pre-line">
              {m.content}
            </p>
          ) : m.kind === 'emergency' ? (
            <EmergencyMessage key={m.id} ruleId={m.sources[0]?.id} />
          ) : (
            <article key={m.id} className="flex gap-3">
              <AssistantMark className="mt-2.5" />
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <p className="whitespace-pre-line">{m.content}</p>
                {m.kind === 'unknown' && (
                  <a href="tel:104" className="w-fit font-semibold text-neel underline underline-offset-4">{t('call', { n: 104 })}</a>
                )}
                {m.sources.length > 0 && <Sources sources={m.sources} />}
                {m.kind === 'composed' && <p className="text-sm text-muted">{t('chatComposedNote')}</p>}
                {can.speak && (
                  <button type="button" onClick={() => toggleSpeak(m)} aria-pressed={speakingId === m.id} className="flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
                    {speakingId === m.id ? <Stop size={18} aria-hidden /> : <SpeakerHigh size={18} aria-hidden />}
                    {t(speakingId === m.id ? 'stop' : 'readAloud')}
                  </button>
                )}
              </div>
            </article>
          ),
        )}

        {busy && (
          <p className="flex items-center gap-3 text-muted">
            <AssistantMark busy />
            {t('chatThinking')}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] mt-4 flex flex-col gap-2 bg-canvas pt-2 lg:bottom-4">
        <div className="flex items-end gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-2 focus-within:border-neel">
          <textarea
            ref={inputRef}
            name="question"
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void send(text)
              }
            }}
            placeholder={listening ? t('chatListening') : t('chatPlaceholder')}
            aria-label={t('chatPlaceholder')}
            className="max-h-40 min-h-11 flex-1 resize-none [field-sizing:content] bg-transparent px-2 py-2 placeholder:text-muted focus:outline-none focus-visible:outline-none"
          />
          {can.listen && (
            <button
              type="button"
              onClick={toggleListen}
              aria-pressed={!!listening}
              aria-label={t('chatSpeak')}
              className={cx('flex size-11 shrink-0 items-center justify-center rounded-full', listening ? 'bg-danger text-surface' : 'text-neel hover:bg-neel-soft')}
            >
              <Microphone size={22} weight="fill" aria-hidden />
            </button>
          )}
          <button type="submit" disabled={!text.trim() || busy} aria-label={t('chatSend')} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-neel text-on-neel disabled:opacity-40">
            <ArrowUp size={22} weight="bold" aria-hidden />
          </button>
        </div>
        <p className="px-1 text-xs text-muted">{t('chatDisclaimer')}</p>
      </form>
    </div>
  )
}

function Sources({ sources }: { sources: Source[] }) {
  const t = useT()
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-semibold text-muted">{t('chatFrom')}</p>
      <ul className="flex flex-wrap gap-2">
        {sources.map((s, i) => (
          <li key={s.id}>
            <Link href={`/first-aid/view/?id=${s.id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm hover:border-neel">
              <span className="font-semibold text-neel tabular-nums">{i + 1}</span>
              {s.title}
              <span className="text-muted">· {t('demoContent')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EmergencyMessage({ ruleId }: { ruleId?: string }) {
  const rule = emergencyRules.find((r) => r.id === ruleId)
  return rule ? <EmergencyCard rule={rule} /> : null
}

export default function ChatPage() {
  return (
    <Suspense>
      <Chat />
    </Suspense>
  )
}
