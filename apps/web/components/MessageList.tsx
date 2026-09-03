import type { ChatMessageData } from "../lib/types";

interface MessageListProps {
  messages: ChatMessageData[];
  pending: boolean;
}

export function MessageList({ messages, pending }: MessageListProps) {
  if (messages.length === 0 && !pending) {
    return (
      <div className="message-list message-list-empty">
        <p>Ask a question about Nepali law to get started.</p>
      </div>
    );
  }

  return (
    <div className="message-list">
      {messages.map((message) => (
        <div key={message.id} className={`message message-${message.role.toLowerCase()}`}>
          <div className="message-bubble">
            <p>{message.content}</p>
          </div>
        </div>
      ))}
      {pending ? (
        <div className="message message-assistant">
          <div className="message-bubble message-bubble-pending">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
