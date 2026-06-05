/* eslint-disable react/prop-types */
import { FaChartLine, FaTrash } from 'react-icons/fa';
import { BsBookmark } from 'react-icons/bs';
import { t } from '@extension/i18n';

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
}

interface ChatHistoryListProps {
  sessions: ChatSession[];
  onSessionSelect: (sessionId: string) => void;
  onSessionDelete: (sessionId: string) => void;
  onSessionBookmark: (sessionId: string) => void;
  onSessionAccuracy?: (sessionId: string) => void;
  accuracyLoadingSessionId?: string | null;
  title?: string;
  emptyMessage?: string;
  showBookmark?: boolean;
  showAccuracy?: boolean;
  visible: boolean;
  isDarkMode?: boolean;
}

const ChatHistoryList: React.FC<ChatHistoryListProps> = ({
  sessions,
  onSessionSelect,
  onSessionDelete,
  onSessionBookmark,
  onSessionAccuracy,
  accuracyLoadingSessionId = null,
  title = t('chat_history_title'),
  emptyMessage = t('chat_history_empty'),
  showBookmark = true,
  showAccuracy = true,
  visible,
  isDarkMode = false,
}) => {
  if (!visible) return null;

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const titlePaddingClass = showAccuracy || showBookmark ? 'pr-20' : 'pr-8';
  const accuracyPositionClass = showBookmark ? 'right-14' : 'right-8';

  return (
    <div className="h-full overflow-y-auto p-4">
      <h2 className={`mb-4 text-sm font-semibold uppercase tracking-widest ${isDarkMode ? 'text-warm-gray' : 'text-warm-text'}`}>
        {title}
      </h2>
      {sessions.length === 0 ? (
        <div
          className={`rounded border p-4 text-center text-sm ${isDarkMode ? 'border-ebony-muted bg-ebony-light text-warm-text' : 'border-warm-border bg-white text-[#A09A94]'}`}>
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(session => (
            <div
              key={session.id}
              className={`group relative rounded border transition-colors ${
                isDarkMode
                  ? 'border-ebony-muted bg-ebony-light hover:border-oracle-red'
                  : 'border-warm-border bg-white hover:border-oracle-red'
              } p-3`}>
              <button onClick={() => onSessionSelect(session.id)} className="w-full text-left" type="button">
                <h3 className={`${titlePaddingClass} text-sm font-medium ${isDarkMode ? 'text-[#D4CFC9]' : 'text-ebony'}`}>
                  {session.title}
                </h3>
                <p className={`mt-1 text-xs ${isDarkMode ? 'text-warm-text' : 'text-[#A09A94]'}`}>
                  {formatDate(session.createdAt)}
                </p>
              </button>

              {/* Accuracy button - top right */}
              {showAccuracy && onSessionAccuracy && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onSessionAccuracy(session.id);
                  }}
                  className={`absolute ${accuracyPositionClass} top-2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 ${
                    isDarkMode
                      ? 'text-oracle-red hover:bg-ebony-muted'
                      : 'text-oracle-red hover:bg-canvas'
                  }`}
                  aria-label="Check DOM replay accuracy"
                  title="Check DOM replay accuracy"
                  disabled={accuracyLoadingSessionId === session.id}
                  type="button">
                  <FaChartLine size={13} />
                </button>
              )}

              {/* Bookmark button - top right */}
              {showBookmark && onSessionBookmark && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onSessionBookmark(session.id);
                  }}
                  className={`absolute right-8 top-2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 ${
                    isDarkMode
                      ? 'text-oracle-red hover:bg-ebony-muted'
                      : 'text-oracle-red hover:bg-canvas'
                  }`}
                  aria-label={t('chat_history_bookmark')}
                  type="button">
                  <BsBookmark size={13} />
                </button>
              )}

              {/* Delete button - top right */}
              <button
                onClick={e => {
                  e.stopPropagation();
                  onSessionDelete(session.id);
                }}
                className={`absolute right-2 top-2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 ${
                  isDarkMode
                    ? 'text-warm-text hover:bg-ebony-muted hover:text-warm-gray'
                    : 'text-[#A09A94] hover:bg-canvas hover:text-ebony'
                }`}
                aria-label={t('chat_history_delete')}
                type="button">
                <FaTrash size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChatHistoryList;
