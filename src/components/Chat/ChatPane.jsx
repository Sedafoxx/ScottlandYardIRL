import { useState, useEffect, useRef } from 'react';
import { db } from '../../firebase/config';
import { ref, onChildAdded, push, set } from 'firebase/database';

export default function ChatPane({ gameCode, senderName, globalPath, privatePath, sendPath, title, onNewMessage, unreadCount, onMarkRead }) {
  const [globalMsgs, setGlobalMsgs] = useState([]);
  const [privateMsgs, setPrivateMsgs] = useState([]);
  const [text, setText] = useState('');
  const [sendError, setSendError] = useState('');
  const [hasNew, setHasNew] = useState(false);
  const listRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const mountTimeRef = useRef(Date.now());

  useEffect(() => {
    if (!globalPath) { setGlobalMsgs([]); return; }
    setGlobalMsgs([]);
    stickToBottomRef.current = true;
    return onChildAdded(ref(db, `games/${gameCode}/${globalPath}`), (snap) => {
      const msg = { ...snap.val(), _tag: 'global', _key: snap.key };
      setGlobalMsgs(prev => [...prev, msg]);
      if (msg.timestamp > mountTimeRef.current && onNewMessage) onNewMessage(msg);
    });
  }, [gameCode, globalPath]);

  useEffect(() => {
    if (!privatePath) { setPrivateMsgs([]); return; }
    setPrivateMsgs([]);
    stickToBottomRef.current = true;
    return onChildAdded(ref(db, `games/${gameCode}/${privatePath}`), (snap) => {
      const msg = { ...snap.val(), _tag: 'private', _key: snap.key };
      setPrivateMsgs(prev => [...prev, msg]);
      if (msg.timestamp > mountTimeRef.current && onNewMessage) onNewMessage(msg);
    });
  }, [gameCode, privatePath]);

  const messages = [...globalMsgs, ...privateMsgs].sort((a, b) => a.timestamp - b.timestamp);

  /**
   * Scroll ONLY the message box, and only when the reader is already at the
   * bottom. The old implementation called scrollIntoView() on every message,
   * which yanked the whole page (and the reader's place in the history) each
   * time anyone typed. Never touch window scroll here.
   */
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      setHasNew(false);
    } else {
      setHasNew(true);
    }
  }, [messages.length]);

  const onListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance < 40;
    if (stickToBottomRef.current) setHasNew(false);
  };

  const jumpToLatest = () => {
    const el = listRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
    el.scrollTop = el.scrollHeight;
    setHasNew(false);
  };

  const send = async () => {
    if (!text.trim()) return;
    setSendError('');
    const msg = text.trim();
    setText('');
    try {
      const msgRef = push(ref(db, `games/${gameCode}/${sendPath}`));
      await set(msgRef, {
        from: senderName,
        text: msg,
        timestamp: Date.now(),
      });
      // You just wrote it — that is the one case where jumping to the end is wanted.
      stickToBottomRef.current = true;
      jumpToLatest();
    } catch (err) {
      setSendError(`Send failed: ${err.code ?? err.message}`);
      setText(msg);
    }
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1rem' }}>{title}</h2>
          {unreadCount > 0 && (
            <span style={{
              background: 'var(--color-primary)', color: '#fff',
              borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700,
              padding: '0.1rem 0.45rem', lineHeight: '1.4',
            }}>
              {unreadCount}
            </span>
          )}
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <div
          ref={listRef}
          onScroll={onListScroll}
          data-testid="chat-scroll"
          style={{
            height: '220px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
            padding: '0.5rem',
            background: 'var(--color-bg)',
            borderRadius: '8px',
          }}>
          {messages.length === 0 && (
            <p className="text-muted" style={{ textAlign: 'center', margin: 'auto', fontSize: '0.875rem' }}>
              No messages yet.
            </p>
          )}

          {messages.map((msg) => {
            const isMe = msg.from === senderName;
            return (
              <div
                key={`${msg._tag}-${msg._key}`}
                style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}
              >
                <div style={{
                  background: isMe ? 'var(--color-accent)' : 'var(--color-surface)',
                  color: isMe ? 'white' : 'var(--color-text)',
                  padding: '0.4rem 0.75rem',
                  borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  maxWidth: '80%',
                  fontSize: '0.875rem',
                  lineHeight: 1.4,
                }}>
                  {msg._tag === 'global' && !isMe && (
                    <span style={{ fontSize: '0.7rem', opacity: 0.7, display: 'block', marginBottom: '0.1rem' }}>
                      All teams
                    </span>
                  )}
                  {msg.text}
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', margin: '0.1rem 0.25rem 0' }}>
                  {msg.from} · {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </div>
            );
          })}
        </div>

        {hasNew && (
          <button
            onClick={jumpToLatest}
            data-testid="chat-new-chip"
            style={{
              position: 'absolute', bottom: '0.4rem', left: '50%', transform: 'translateX(-50%)',
              background: 'var(--color-accent)', color: '#fff', border: 'none',
              borderRadius: '999px', padding: '0.25rem 0.7rem', fontSize: '0.72rem',
              fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            ↓ new messages
          </button>
        )}
      </div>

      {sendError && (
        <p style={{ color: 'var(--color-primary)', fontSize: '0.8rem' }}>{sendError}</p>
      )}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          placeholder="Message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          onFocus={() => onMarkRead?.()}
          style={{ flex: 1, marginBottom: 0 }}
        />
        <button
          className="btn btn-accent"
          onClick={send}
          disabled={!text.trim()}
          style={{ width: 'auto', padding: '0.5rem 1rem', flexShrink: 0 }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
