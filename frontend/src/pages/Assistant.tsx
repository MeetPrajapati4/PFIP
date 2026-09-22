import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bot, Check, Copy, Database, Send, Sparkles, Square, Trash2, User as UserIcon, WifiOff,
} from 'lucide-react'
import { chatApi } from '../lib/api'
import type { ChatMessage } from '../lib/types'
import { cn } from '../lib/utils'
import { Badge, Button, ConfirmDialog, Tooltip, useToast } from '../components/ui'

/**
 * Streaming assistant.
 *
 * Answers arrive over SSE so a multi-second grounded response reads as it's
 * written rather than appearing all at once after a spinner. The stream also
 * emits which data the answer was retrieved from, rendered as chips under the
 * reply — an assistant discussing your money should show its sources.
 */
export default function Assistant() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [input, setInput] = useState('')
  const [pendingUser, setPendingUser] = useState<string | null>(null)
  const [streamed, setStreamed] = useState('')
  const [sources, setSources] = useState<string[]>([])
  const [streaming, setStreaming] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const sourceRef = useRef<EventSource | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { data: history } = useQuery({ queryKey: ['chat-history'], queryFn: chatApi.history })
  const { data: meta } = useQuery({ queryKey: ['chat-meta'], queryFn: chatApi.meta })

  const messages = history ?? []

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  useEffect(scrollToBottom, [messages.length, streamed, pendingUser, scrollToBottom])

  // Tear the connection down if the user navigates away mid-answer.
  useEffect(() => () => sourceRef.current?.close(), [])

  const stop = useCallback(() => {
    sourceRef.current?.close()
    sourceRef.current = null
    setStreaming(false)
    setPendingUser(null)
    setStreamed('')
    queryClient.invalidateQueries({ queryKey: ['chat-history'] })
  }, [queryClient])

  const submit = useCallback((text: string) => {
    const message = text.trim()
    if (!message || streaming) return

    setPendingUser(message)
    setStreamed('')
    setSources([])
    setInput('')
    setStreaming(true)

    const es = new EventSource(chatApi.streamUrl(message))
    sourceRef.current = es

    es.addEventListener('sources', (e) => {
      setSources(JSON.parse((e as MessageEvent).data).sources ?? [])
    })
    es.addEventListener('delta', (e) => {
      setStreamed((current) => current + (JSON.parse((e as MessageEvent).data).text ?? ''))
    })
    es.addEventListener('done', () => {
      es.close()
      sourceRef.current = null
      setStreaming(false)
      setPendingUser(null)
      setStreamed('')
      queryClient.invalidateQueries({ queryKey: ['chat-history'] })
    })
    es.addEventListener('error', () => {
      es.close()
      sourceRef.current = null
      setStreaming(false)
      // The server may still have persisted a reply before the socket dropped.
      queryClient.invalidateQueries({ queryKey: ['chat-history'] })
      setPendingUser(null)
      setStreamed('')
      toast.error('The answer stream dropped', 'Try asking again.')
    })
  }, [streaming, queryClient, toast])

  const clear = async () => {
    await chatApi.clear()
    queryClient.setQueryData(['chat-history'], [])
    setConfirmClear(false)
    toast.success('Conversation cleared')
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(input)
    }
  }

  // Grow the composer with the message, up to a sane ceiling.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [input])

  const empty = messages.length === 0 && !pendingUser

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-3xl flex-col">
      <header className="flex items-start justify-between gap-4 pb-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-2.5 font-display text-2xl font-bold text-strong">
            Assistant
            {meta && (
              <Badge tone={meta.ai_online ? 'violet' : 'neutral'}>
                {meta.ai_online
                  ? <><Sparkles className="h-3 w-3" /> Gemini</>
                  : <><WifiOff className="h-3 w-3" /> Local mode</>}
              </Badge>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {meta?.ai_online
              ? 'Every answer is retrieved from your real transactions before it is written.'
              : 'Running on the local analytics engine — add a Gemini key for full conversation.'}
          </p>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" icon={Trash2} onClick={() => setConfirmClear(true)}>
            <span className="hidden sm:inline">Clear</span>
          </Button>
        )}
      </header>

      <div
        ref={scrollRef}
        className="card flex-1 space-y-5 overflow-y-auto p-5"
      >
        {empty && <Welcome suggestions={meta?.suggestions ?? []} onPick={submit} />}

        <AnimatePresence initial={false}>
          {messages.map((m) => <Bubble key={m.id} message={m} />)}
        </AnimatePresence>

        {pendingUser && (
          <Bubble
            message={{ id: -1, role: 'user', content: pendingUser, grounding: [], created_at: '' }}
          />
        )}

        {streaming && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3"
          >
            <Avatar role="assistant" />
            <div className="min-w-0 flex-1">
              {sources.length > 0 && <SourceChips sources={sources} />}
              {streamed ? (
                <div className="rounded-2xl rounded-tl-md bg-raised px-4 py-3">
                  <Markdown text={streamed} />
                  <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-brand align-middle" />
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-tl-md bg-raised px-4 py-3.5">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      animate={{ opacity: [0.25, 1, 0.25] }}
                      transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
                      className="h-1.5 w-1.5 rounded-full bg-muted"
                    />
                  ))}
                  <span className="ml-1.5 text-xs text-muted">Reading your transactions…</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit(input)
        }}
        className="mt-4 flex items-end gap-2.5"
      >
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask about a category, a merchant, a month, your subscriptions or what you can afford…"
            className="input resize-none pr-3 !py-3"
            maxLength={2000}
            aria-label="Message"
          />
        </div>
        {streaming ? (
          <button
            type="button"
            onClick={stop}
            aria-label="Stop generating"
            className="btn-secondary !rounded-xl !p-3.5"
          >
            <Square className="h-5 w-5" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Send"
            className="btn-primary !rounded-xl !p-3.5"
          >
            <Send className="h-5 w-5" />
          </button>
        )}
      </form>
      <p className="mt-2 text-center text-2xs text-faint">
        Answers come only from your imported data. Press Enter to send, Shift+Enter for a new line.
      </p>

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={clear}
        danger
        title="Clear this conversation?"
        confirmLabel="Clear"
        body="The message history is deleted. Your transactions and analysis are untouched."
      />
    </div>
  )
}

function Welcome({
  suggestions, onPick,
}: {
  suggestions: string[]
  onPick: (text: string) => void
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-10 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet/10">
        <Bot className="h-7 w-7 text-violet" />
      </div>
      <h3 className="font-display text-lg font-semibold text-strong">Ask me about your money</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
        I pull your actual records — categories, merchants, months, subscriptions, forecast —
        before answering, and I'll tell you when the data doesn't cover the question.
      </p>
      <div className="mt-6 flex max-w-lg flex-wrap justify-center gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-full border border-hairline px-3.5 py-1.5 text-xs text-body
              transition-all hover:border-brand/50 hover:bg-brand/[0.06] hover:text-brand"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

function Avatar({ role }: { role: 'user' | 'assistant' }) {
  return (
    <span className={cn(
      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
      role === 'user' ? 'bg-brand/10' : 'bg-violet/10',
    )}>
      {role === 'user'
        ? <UserIcon className="h-4 w-4 text-brand" />
        : <Bot className="h-4 w-4 text-violet" />}
    </span>
  )
}

function SourceChips({ sources }: { sources: string[] }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <Tooltip content="What this answer was retrieved from">
        <Database className="h-3 w-3 cursor-help text-faint" />
      </Tooltip>
      {sources.map((source) => (
        <span
          key={source}
          className="rounded-md border border-hairline bg-raised px-1.5 py-0.5 text-2xs text-muted"
        >
          {source}
        </span>
      ))}
    </div>
  )
}

function Bubble({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  const copy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn('group flex items-start gap-3', isUser && 'flex-row-reverse')}
    >
      <Avatar role={message.role} />
      <div className={cn('min-w-0 max-w-[85%]', isUser && 'flex flex-col items-end')}>
        {!isUser && message.grounding.length > 0 && <SourceChips sources={message.grounding} />}
        <div className={cn(
          'rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'rounded-tr-md bg-brand text-brand-contrast'
            : 'rounded-tl-md bg-raised text-body',
        )}>
          {isUser ? message.content : <Markdown text={message.content} />}
        </div>
        {!isUser && (
          <button
            onClick={copy}
            className="mt-1 flex items-center gap-1 rounded px-1 py-0.5 text-2xs text-faint
              opacity-0 transition-opacity hover:text-strong focus:opacity-100 group-hover:opacity-100"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
    </motion.div>
  )
}

/**
 * Minimal markdown renderer for the subset the assistant is told to emit:
 * bold, inline code, and bullet lists. Deliberately not a full parser — the
 * content is our own model's output under a tight prompt, and shipping a
 * markdown library for three constructs isn't worth the bundle.
 */
function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => {
    const lines = text.split('\n')
    const out: { type: 'p' | 'li'; content: string }[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      if (/^[-*•]\s+/.test(trimmed)) {
        out.push({ type: 'li', content: trimmed.replace(/^[-*•]\s+/, '') })
      } else if (/^\d+\.\s+/.test(trimmed)) {
        out.push({ type: 'li', content: trimmed.replace(/^\d+\.\s+/, '') })
      } else {
        out.push({ type: 'p', content: trimmed })
      }
    }
    return out
  }, [text])

  const inline = (content: string) => {
    const parts = content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-strong">{part.slice(2, -2)}</strong>
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} className="rounded bg-surface px-1 py-0.5 font-mono text-xs text-brand">
            {part.slice(1, -1)}
          </code>
        )
      }
      return <span key={i}>{part}</span>
    })
  }

  const elements: JSX.Element[] = []
  let listBuffer: string[] = []

  const flushList = () => {
    if (!listBuffer.length) return
    elements.push(
      <ul key={`ul-${elements.length}`} className="my-1.5 space-y-1 pl-1">
        {listBuffer.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
            <span>{inline(item)}</span>
          </li>
        ))}
      </ul>,
    )
    listBuffer = []
  }

  blocks.forEach((block, i) => {
    if (block.type === 'li') {
      listBuffer.push(block.content)
      return
    }
    flushList()
    elements.push(
      <p key={`p-${i}`} className="[&+p]:mt-2">{inline(block.content)}</p>,
    )
  })
  flushList()

  return <div className="space-y-1">{elements}</div>
}
