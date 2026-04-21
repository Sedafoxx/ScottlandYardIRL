import { useState, useEffect, useRef } from 'react';
import { db } from '../../firebase/config';
import { ref, onChildAdded, push, set } from 'firebase/database';

export default function ChatPane({ gameCode, senderName, globalPath, privatePath, sendPath, title }) {
  const [globalMsgs, setGlobalMsgs] = useState([]);
  const [privateMsgs, setPrivateMsgs] = useState([]);
  const [text, setText] = useState('');
  const [sendError, setSendError] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!globalPath) { setGlobalMsgs([]); return; }
    setGlobalMsgs([]);
    return onChildAdded(ref(db, `games/${gameCode}/${globalPath}`), (snap) => {
      setGlobalMsgs(prev => [...prev, { ...snap.val(), _tag: 'global', _key: snap.key }]);
    });
  }, [gameCode, globalPath]);

  useEffect(() => {
    if (!privatePath) { setPrivateMsgs([]); return; }
    setPrivateMsgs([]);
    return onChildAdded(ref(db, `games/${gameCode}/${privatePath}`), (snap) => {
      setPrivateMsgs(prev => [...prev, { ...snap.val(), _tag: 'private', _key: snap.key }]);
    });
  }, [gameCode, privatePath]);

  const messages = [...globalMsgs, ...privateMsgs].sort((a, b) => a.timestamp - b.timestamp);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

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
    } catch (err) {
      setSendError(`Send failed: ${err.code ?? err.message}`);
      setText(msg);
    }
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {title && <h2 style={{ fontSize: '1rem' }}>{title}</h2>}

      <div style={{
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

        <div ref={bottomRef} />
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
