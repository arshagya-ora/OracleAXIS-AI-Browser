import type { Message } from '@extension/storage';
import { ACTOR_PROFILES } from '../types/message';
import { memo } from 'react';

interface MessageListProps {
  messages: Message[];
  isDarkMode?: boolean;
}

export default memo(function MessageList({ messages, isDarkMode = false }: MessageListProps) {
  return (
    <div className="max-w-full space-y-4">
      {messages.map((message, index) => (
        <MessageBlock
          key={`${message.actor}-${message.timestamp}-${index}`}
          message={message}
          isSameActor={index > 0 ? messages[index - 1].actor === message.actor : false}
          isDarkMode={isDarkMode}
        />
      ))}
    </div>
  );
});

interface MessageBlockProps {
  message: Message;
  isSameActor: boolean;
  isDarkMode?: boolean;
}

function MessageBlock({ message, isSameActor, isDarkMode = false }: MessageBlockProps) {
  if (!message.actor) {
    console.error('No actor found');
    return <div />;
  }
  const actor = ACTOR_PROFILES[message.actor as keyof typeof ACTOR_PROFILES];
  const isProgress = message.content === 'Showing progress...';
  const isUser = message.actor === 'user';
  
  // Redwood block styles
  const userBlockClass = isDarkMode ? 'bg-[#3A3836] text-[#D4CFC9]' : 'bg-[#E0DDD5] text-[#2D2B29]';
  const aiBlockClass = 'bg-[#8B2C20] text-white'; // Burnt Redwood
  const blockClass = isUser ? userBlockClass : aiBlockClass;

  if (isProgress) {
    return (
      <div className={`mt-2 flex w-full justify-end animate-slide-up`}>
        <div className={`w-11/12 max-w-3xl rounded-sm p-2 text-xs font-mono shadow-sm animate-glow-pulse ${isDarkMode ? 'bg-[#2D2B29] text-[#A09A94] border border-[#4A4644]' : 'bg-[#F8F7F3] text-[#6B6460] border border-[#E0DDD5]'}`}>
          <details open className="cursor-pointer">
            <summary className="flex items-center gap-2 outline-none">
              <svg className="size-3 animate-faint-rotate opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
              </svg>
              <span>[Trace Log] Generating response...</span>
            </summary>
            <div className="mt-2 pl-5 opacity-80">
              {'>'} Analyzing DOM tree...<br/>
              {'>'} Computing optimal selector path...
            </div>
          </details>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex max-w-full gap-2 animate-slide-up ${isUser ? 'flex-row-reverse justify-start' : 'justify-start'}`}>
      {/* AI side icon */}
      {!isSameActor && !isUser && (
        <div className="flex size-6 shrink-0 items-center justify-center pt-1 opacity-60">
          <svg className="size-4 text-[#8B2C20]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
            <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
        </div>
      )}
      {isSameActor && !isUser && <div className="w-6" />}

      <div className="flex max-w-[75%] flex-col">
        {/* Actor label ABOVE the block */}
        {!isSameActor && !isUser && (
          <div className="mb-0.5 text-[10px] font-semibold tracking-widest uppercase text-[#8B2C20] opacity-80">
            {actor.name}
          </div>
        )}

        <div className={`rounded-sm py-2 px-3 shadow-sm ${blockClass}`}>
          <div className="whitespace-pre-wrap break-words text-sm leading-snug">
            {message.content}
          </div>
          <div className={`text-right text-[9px] mt-1 ${isUser
            ? isDarkMode ? 'text-[#6B6460]' : 'text-[#908E89]'
            : 'text-white/40'
          }`}>
            {formatTimestamp(message.timestamp)}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Formats a timestamp (in milliseconds) to a readable time string
 * @param timestamp Unix timestamp in milliseconds
 * @returns Formatted time string
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  // Check if the message is from today
  const isToday = date.toDateString() === now.toDateString();

  // Check if the message is from yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  // Check if the message is from this year
  const isThisYear = date.getFullYear() === now.getFullYear();

  // Format the time (HH:MM)
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isToday) {
    return timeStr; // Just show the time for today's messages
  }

  if (isYesterday) {
    return `Yesterday, ${timeStr}`;
  }

  if (isThisYear) {
    // Show month and day for this year
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
  }

  // Show full date for older messages
  return `${date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}, ${timeStr}`;
}
