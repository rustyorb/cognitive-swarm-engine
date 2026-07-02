import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MessageCircleQuestion, Send, Sparkles } from 'lucide-react';
import { AppConfig } from '../types';

interface InterrogatePanelProps {
  runId: string;
  query: string;
  dossier: string;
  findings: { designation: string; result: string }[];
  config: AppConfig;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'Summarize the key risks',
  'What did the specialists disagree on?',
  "What's missing from this analysis?"
];

export function InterrogatePanel({ runId, query, dossier, findings, config }: InterrogatePanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Reset the thread whenever a different dossier is shown.
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setInput('');
    setBusy(false);
  }, [runId]);

  // Auto-scroll the transcript to the bottom as it grows / streams.
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages]);

  const submitQuestion = async (raw: string) => {
    const question = raw.trim();
    if (!question || busy) return;

    // History = the turns BEFORE this question.
    const history = messages;

    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setInput('');
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/interrogate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, dossier, findings, question, history, config }),
        signal: controller.signal
      });

      if (!res.ok) {
        let apiError = 'API Error';
        try {
          const errData = await res.json();
          if (errData?.error) apiError = errData.error;
        } catch { /* non-JSON error body */ }
        setMessages(prev => [...prev, { role: 'assistant', content: `__ERROR__${apiError}` }]);
        return;
      }
      if (!res.body) throw new Error('No stream body');

      // Append an empty assistant message we grow as chunks arrive.
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const snapshot = accumulated;
        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: snapshot };
          return next;
        });
      }

      accumulated += decoder.decode();
      const final = accumulated;
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: final };
        return next;
      });
      reader.releaseLock();
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setMessages(prev => [...prev, { role: 'assistant', content: `__ERROR__${err.message || 'Unknown error'}` }]);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const handleSend = () => submitQuestion(input);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = !busy && input.trim().length > 0;

  return (
    <div className="border border-stone-800 rounded-xl bg-black/40 overflow-hidden">
      <div className="bg-stone-900 border-b border-stone-800 px-6 py-3 flex items-center gap-2">
        <MessageCircleQuestion className="w-4 h-4 text-phosphor-400" />
        <h3 className="font-display text-sm text-phosphor-400 uppercase tracking-widest">
          Interrogate the Swarm
        </h3>
      </div>

      <div ref={transcriptRef} className="max-h-96 overflow-y-auto px-4 sm:px-6 py-4 flex flex-col gap-4">
        {messages.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-mono text-stone-500 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              Ask a follow-up about this dossier
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submitQuestion(s)}
                  disabled={busy}
                  className="text-xs font-mono px-3 py-1.5 rounded-full border border-stone-800 bg-black text-stone-400 hover:text-phosphor-300 hover:border-phosphor-900/50 hover:bg-phosphor-950/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === 'user') {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-lg rounded-br-sm border border-phosphor-900/50 bg-phosphor-950/30 px-3 py-2 text-sm text-phosphor-100 whitespace-pre-wrap">
                  {msg.content}
                </div>
              </div>
            );
          }

          const isError = msg.content.startsWith('__ERROR__');
          if (isError) {
            return (
              <div key={i} className="flex justify-start">
                <div className="max-w-[85%] rounded-lg rounded-bl-sm border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs font-mono text-red-400">
                  ERR: {msg.content.slice('__ERROR__'.length)}
                </div>
              </div>
            );
          }

          return (
            <div key={i} className="flex justify-start">
              <div className="max-w-[85%] rounded-lg rounded-bl-sm border border-stone-800 bg-stone-950/60 px-3 py-2">
                <div className="prose prose-invert prose-stone prose-sm max-w-none
                                prose-a:text-phosphor-400 prose-strong:text-phosphor-200
                                prose-code:text-orange-300 prose-code:bg-orange-950/40 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
                                prose-pre:bg-stone-950 prose-pre:border prose-pre:border-stone-800
                                prose-th:text-phosphor-300 prose-th:border-stone-700 prose-td:border-stone-800
                                prose-table:block prose-table:overflow-x-auto">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content || '…'}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-stone-800 p-3 sm:p-4 flex items-end gap-3 bg-stone-950/40">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Interrogate the dossier… (Enter to send, Shift+Enter for newline)"
          disabled={busy}
          className="flex-1 resize-none bg-black border border-stone-800 rounded-lg px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-phosphor-500 focus:ring-1 focus:ring-phosphor-500 transition-all disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className="shrink-0 bg-phosphor-950 text-phosphor-400 border border-phosphor-900 px-4 py-2.5 rounded-lg font-mono font-bold uppercase tracking-wider hover:bg-phosphor-900 hover:text-phosphor-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          title="Send question"
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">Send</span>
        </button>
      </div>
    </div>
  );
}
