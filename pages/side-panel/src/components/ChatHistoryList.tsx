/* eslint-disable react/prop-types */
import { FaTrash } from 'react-icons/fa';
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
  visible: boolean;
  isDarkMode?: boolean;
}

const ChatHistoryList: React.FC<ChatHistoryListProps> = ({
  sessions,
  onSessionSelect,
  onSessionDelete,
  onSessionBookmark,
  visible,
  isDarkMode = false,
}) => {
  if (!visible) return null;

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <h2 className={`mb-4 text-sm font-semibold uppercase tracking-widest ${isDarkMode ? 'text-[#C4BFBA]' : 'text-[#6B6460]'}`}>
        {t('chat_history_title')}
      </h2>
      {sessions.length === 0 ? (
        <div
          className={`rounded border p-4 text-center text-sm ${isDarkMode ? 'border-[#4A4644] bg-[#3A3836] text-[#6B6460]' : 'border-[#E0DDD5] bg-white text-[#A09A94]'}`}>
          {t('chat_history_empty')}
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(session => (
            <div
              key={session.id}
              className={`group relative rounded border transition-colors ${
                isDarkMode
                  ? 'border-[#4A4644] bg-[#3A3836] hover:border-[#C74634]'
                  : 'border-[#E0DDD5] bg-white hover:border-[#C74634]'
              } p-3`}>
              <button onClick={() => onSessionSelect(session.id)} className="w-full text-left" type="button">
                <h3 className={`pr-8 text-sm font-medium ${isDarkMode ? 'text-[#D4CFC9]' : 'text-[#2D2B29]'}`}>
                  {session.title}
                </h3>
                <p className={`mt-1 text-xs ${isDarkMode ? 'text-[#6B6460]' : 'text-[#A09A94]'}`}>
                  {formatDate(session.createdAt)}
                </p>
              </button>

              {/* Bookmark button - top right */}
              {onSessionBookmark && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onSessionBookmark(session.id);
                  }}
                  className={`absolute right-8 top-2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 ${
                    isDarkMode
                      ? 'text-[#C74634] hover:bg-[#4A4644]'
                      : 'text-[#C74634] hover:bg-[#F8F7F3]'
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
                    ? 'text-[#6B6460] hover:bg-[#4A4644] hover:text-[#C4BFBA]'
                    : 'text-[#A09A94] hover:bg-[#F8F7F3] hover:text-[#2D2B29]'
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
