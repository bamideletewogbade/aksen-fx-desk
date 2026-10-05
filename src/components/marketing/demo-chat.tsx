'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Pencil, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';

/**
 * A short guided conversation instead of a form. It is scripted, not AI:
 * every question is fixed, and nothing is sent until the visitor taps Send.
 */
type Key = 'name' | 'business' | 'role' | 'monthlyTrades' | 'message' | 'contact';

interface Question {
  key: Key;
  ask: (a: Partial<Record<Key, string>>) => string;
  chips?: string[];
  placeholder?: string;
  optional?: boolean;
  validate?: (v: string) => string | null;
}

const QUESTIONS: Question[] = [
  { key: 'name', ask: () => 'Hi, thanks for stopping by. What should we call you?', placeholder: 'Your name', validate: (v) => (v.trim().length < 2 ? 'Just your first name is fine.' : null) },
  { key: 'business', ask: (a) => `Good to meet you, ${a.name?.split(' ')[0]}. What’s your desk or business called?`, placeholder: 'Desk or business name', optional: true },
  { key: 'role', ask: () => 'And your role there?', chips: ['Owner', 'Desk manager', 'Dealer', 'Compliance or finance'], placeholder: 'Or type it' },
  { key: 'monthlyTrades', ask: () => 'Roughly how many trades does the desk do in a month?', chips: ['Under 100', '100 to 500', '500 to 2,000', 'Over 2,000', 'Rather not say'] },
  { key: 'message', ask: () => 'What slows the desk down most today?', chips: ['Checking payment receipts', 'Keeping rates consistent', 'Day-end totals not matching', 'Too many chats to follow'], placeholder: 'Or tell us in your words' },
  {
    key: 'contact',
    ask: () => 'Last one. Where can we reach you? A WhatsApp number or an email both work.',
    placeholder: '+233… or name@desk.com',
    validate: (v) => (/@/.test(v) || v.replace(/[^\d]/g, '').length >= 9 ? null : 'That doesn’t look like a phone number or email yet.'),
  },
];

type Msg = { from: 'aksen' | 'you'; text: string; id: number };

function Bubble({ m }: { m: Msg }) {
  const you = m.from === 'you';
  return (
    <div className={`animate-pop flex ${you ? 'justify-end' : 'justify-start'}`}>
      {!you && <span className="mr-2 mt-auto flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[0.625rem] font-bold text-lime">AK</span>}
      <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${you ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md border border-line bg-white text-ink'}`}>{m.text}</div>
    </div>
  );
}

export function DemoChat() {
  const [answers, setAnswers] = useState<Partial<Record<Key, string>>>({});
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [step, setStep] = useState(0);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [phase, setPhase] = useState<'asking' | 'review' | 'sending' | 'sent'>('asking');
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  const say = (text: string, from: Msg['from'] = 'aksen') => setMsgs((m) => [...m, { from, text, id: ++seq.current }]);
  const botSay = (text: string, after = 650) =>
    new Promise<void>((resolve) => {
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        say(text);
        resolve();
      }, after);
    });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    botSay(QUESTIONS[0].ask({}), 500);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [msgs, typing, phase]);

  const q = QUESTIONS[step];

  const answer = async (raw: string) => {
    const v = raw.trim();
    if (!v && !q.optional) return;
    const problem = v && q.validate ? q.validate(v) : null;
    if (problem) {
      setHint(problem);
      return;
    }
    setHint(null);
    const next = { ...answers, [q.key]: v };
    setAnswers(next);
    say(v || 'Skip', 'you');
    setInput('');
    if (step + 1 < QUESTIONS.length) {
      setStep(step + 1);
      await botSay(QUESTIONS[step + 1].ask(next));
      inputRef.current?.focus({ preventScroll: true });
    } else {
      await botSay('Thanks. Here is what we’ll pass to the team. Send it when you’re happy.');
      setPhase('review');
    }
  };

  const send = async () => {
    setPhase('sending');
    setError(null);
    const contact = answers.contact ?? '';
    try {
      await api('/api/leads', {
        method: 'POST',
        json: {
          name: answers.name,
          business: answers.business || null,
          role: answers.role || null,
          monthlyTrades: answers.monthlyTrades || null,
          message: answers.message || null,
          email: contact.includes('@') ? contact : null,
          phone: contact.includes('@') ? null : contact,
        },
      });
      setPhase('sent');
      await botSay(`Saved, ${answers.name?.split(' ')[0]}. Someone from the team will contact you to set up a walkthrough. Meanwhile, the sample desk is open if you want to click through a trade.`, 500);
    } catch (e) {
      setError((e as Error).message);
      setPhase('review');
    }
  };

  const restart = () => {
    setAnswers({});
    setMsgs([]);
    setStep(0);
    setPhase('asking');
    setInput('');
    setHint(null);
    setError(null);
    botSay(QUESTIONS[0].ask({}), 400);
  };

  const progress = phase === 'asking' ? step / QUESTIONS.length : 1;

  return (
    <div className="flex h-[35rem] flex-col overflow-hidden rounded-3xl border border-line bg-[#f7faf5] shadow-xl">
      <div className="flex items-center justify-between border-b border-line bg-white px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-ink font-mono text-xs font-bold text-lime">
            AK<span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#25d366]" />
          </span>
          <div>
            <div className="text-sm font-bold text-ink">Aksen team</div>
            <div className="text-[0.6875rem] text-subtle">A few quick questions · about a minute</div>
          </div>
        </div>
        <button type="button" onClick={restart} className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs text-subtle hover:bg-[#eef4ec] hover:text-ink" aria-label="Start over"><RotateCcw size={12} /> Restart</button>
      </div>
      <div className="h-1 bg-[#e8efe6]"><div className="h-full bg-brand transition-all duration-500" style={{ width: `${progress * 100}%` }} /></div>

      <div ref={threadRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-5 [background-image:radial-gradient(#dfe8dc_1px,transparent_1px)] [background-size:18px_18px]" aria-live="polite">
        {msgs.map((m) => <Bubble key={m.id} m={m} />)}
        {typing && (
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink font-mono text-[0.625rem] font-bold text-lime">AK</span>
            <span className="flex gap-1 rounded-2xl rounded-bl-md border border-line bg-white px-4 py-3">
              {[0, 1, 2].map((i) => <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-subtle" style={{ animationDelay: `${i * 0.15}s` }} />)}
            </span>
          </div>
        )}
        {phase !== 'asking' && phase !== 'sent' && (
          <div className="animate-pop ml-9 rounded-2xl border border-line bg-white p-4 text-sm shadow-sm">
            <dl className="space-y-1.5">
              {([['Name', answers.name], ['Desk', answers.business], ['Role', answers.role], ['Trades a month', answers.monthlyTrades], ['Slowing you down', answers.message], ['Contact', answers.contact]] as const)
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4"><dt className="text-subtle">{k}</dt><dd className="text-right font-medium text-ink">{v}</dd></div>
                ))}
            </dl>
            {error && <p className="mt-3 text-xs text-risk">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={send} disabled={phase === 'sending'} className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-60"><Check size={15} /> {phase === 'sending' ? 'Sending…' : 'Send to the team'}</button>
              <button type="button" onClick={restart} className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-line px-3 py-2.5 text-sm text-ink hover:bg-[#eef4ec]"><Pencil size={13} /> Change</button>
            </div>
          </div>
        )}
      </div>

      {phase === 'asking' && (
        <div className="border-t border-line bg-white p-3">
          {q?.chips && !typing && (
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {q.chips.map((c, i) => (
                <button key={c} type="button" onClick={() => answer(c)} className="animate-pop cursor-pointer rounded-full border border-[#cfe0c9] bg-[#f3f8f1] px-3 py-1.5 text-xs font-semibold text-brand transition-colors hover:border-brand hover:bg-lime-soft" style={{ animationDelay: `${i * 50}ms` }}>
                  {c}
                </button>
              ))}
              {q.optional && <button type="button" onClick={() => answer('')} className="cursor-pointer rounded-full px-3 py-1.5 text-xs text-subtle hover:text-ink">Skip</button>}
            </div>
          )}
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); answer(input); }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); setHint(null); }}
              placeholder={typing ? 'Aksen is typing…' : q?.placeholder ?? 'Type your answer'}
              disabled={typing}
              aria-label={q ? q.ask(answers) : 'Answer'}
              className="flex-1 rounded-full border border-line bg-paper px-4 py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand focus:bg-white"
            />
            <button type="submit" disabled={typing || (!input.trim() && !q?.optional)} aria-label="Send answer" className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-brand text-white transition-transform hover:scale-105 disabled:opacity-40">
              <ArrowUp size={17} />
            </button>
          </form>
          {hint ? <p className="mt-1.5 px-2 text-xs text-amber">{hint}</p> : q?.optional && !q.chips ? <p className="mt-1.5 px-2 text-xs text-subtle">Optional. Press send with it empty to skip.</p> : null}
        </div>
      )}
      {phase === 'sent' && (
        <div className="border-t border-line bg-white p-3 text-center">
          <a href="/login" className="inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand">Open the sample desk</a>
        </div>
      )}
    </div>
  );
}
