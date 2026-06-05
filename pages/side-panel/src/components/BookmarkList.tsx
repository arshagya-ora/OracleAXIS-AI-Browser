/* eslint-disable react/prop-types */
import { useState, useRef, useEffect } from 'react';
import { FaTrash, FaPen, FaCheck, FaTimes } from 'react-icons/fa';
import { t } from '@extension/i18n';

interface Bookmark {
  id: number;
  title: string;
  content: string;
}

interface BookmarkListProps {
  bookmarks: Bookmark[];
  onBookmarkSelect: (content: string) => void;
  onBookmarkUpdateTitle?: (id: number, title: string) => void;
  onBookmarkDelete?: (id: number) => void;
  onBookmarkReorder?: (draggedId: number, targetId: number) => void;
  isDarkMode?: boolean;
}

const BookmarkList: React.FC<BookmarkListProps> = ({
  bookmarks,
  onBookmarkSelect,
  onBookmarkUpdateTitle,
  onBookmarkDelete,
  onBookmarkReorder,
  isDarkMode = false,
}) => {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleEditClick = (bookmark: Bookmark) => {
    setEditingId(bookmark.id);
    setEditTitle(bookmark.title);
  };

  const handleSaveEdit = (id: number) => {
    if (onBookmarkUpdateTitle && editTitle.trim()) {
      onBookmarkUpdateTitle(id, editTitle);
    }
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, id: number) => {
    setDraggedId(id);
    e.dataTransfer.setData('text/plain', id.toString());
    // Add more transparent effect
    e.currentTarget.classList.add('opacity-25');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('opacity-25');
    setDraggedId(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    if (draggedId === null || draggedId === targetId) return;

    if (onBookmarkReorder) {
      onBookmarkReorder(draggedId, targetId);
    }
  };

  // Focus the input field when entering edit mode
  useEffect(() => {
    if (editingId !== null && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingId]);

  return (
    <div className="p-3">
      <h3 className={`mb-3 text-xs font-semibold uppercase tracking-widest ${isDarkMode ? 'text-warm-text' : 'text-[#A09A94]'}`}>
        {t('chat_bookmarks_header')}
      </h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {bookmarks.map(bookmark => (
          <div
            key={bookmark.id}
            draggable={editingId !== bookmark.id}
            onDragStart={e => handleDragStart(e, bookmark.id)}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDrop={e => handleDrop(e, bookmark.id)}
            className={`group relative rounded border p-3 transition-colors ${
              isDarkMode
                ? 'border-ebony-muted bg-ebony-light hover:border-oracle-red'
                : 'border-warm-border bg-white hover:border-oracle-red'
            }`}>
            {editingId === bookmark.id ? (
              <div className="flex items-center gap-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className={`mr-1 grow rounded border px-2 py-1 text-sm focus:border-oracle-red focus:outline-none ${
                    isDarkMode
                      ? 'border-ebony-muted bg-ebony text-[#D4CFC9]'
                      : 'border-warm-border bg-canvas text-ebony'
                  }`}
                />
                <button
                  onClick={() => handleSaveEdit(bookmark.id)}
                  className={`rounded p-1 transition-colors ${
                    isDarkMode
                      ? 'text-oracle-red hover:bg-ebony-muted'
                      : 'text-oracle-red hover:bg-canvas'
                  }`}
                  aria-label={t('chat_bookmarks_saveEdit')}
                  type="button">
                  <FaCheck size={12} />
                </button>
                <button
                  onClick={handleCancelEdit}
                  className={`rounded p-1 transition-colors ${
                    isDarkMode
                      ? 'text-warm-text hover:bg-ebony-muted'
                      : 'text-[#A09A94] hover:bg-canvas'
                  }`}
                  aria-label={t('chat_bookmarks_cancelEdit')}
                  type="button">
                  <FaTimes size={12} />
                </button>
              </div>
            ) : (
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => onBookmarkSelect(bookmark.content)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      onBookmarkSelect(bookmark.content);
                    }
                  }}
                  className="w-full text-left">
                  <div
                    className={`truncate pr-10 text-sm font-medium ${isDarkMode ? 'text-[#D4CFC9]' : 'text-ebony'}`}>
                    {bookmark.title}
                  </div>
                </button>
              </div>
            )}

            {editingId !== bookmark.id && (
              <>
                {/* Edit button */}
                <button
                  onClick={e => {
                    e.stopPropagation();
                    handleEditClick(bookmark);
                  }}
                  className={`absolute right-7 top-1/2 z-10 -translate-y-1/2 rounded p-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 ${
                    isDarkMode
                      ? 'text-oracle-red hover:bg-ebony-muted'
                      : 'text-oracle-red hover:bg-canvas'
                  }`}
                  aria-label={t('chat_bookmarks_edit')}
                  type="button">
                  <FaPen size={11} />
                </button>

                {/* Delete button */}
                <button
                  onClick={e => {
                    e.stopPropagation();
                    if (onBookmarkDelete) {
                      onBookmarkDelete(bookmark.id);
                    }
                  }}
                  className={`absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded p-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 ${
                    isDarkMode
                      ? 'text-warm-text hover:bg-ebony-muted hover:text-warm-gray'
                      : 'text-[#A09A94] hover:bg-canvas hover:text-ebony'
                  }`}
                  aria-label={t('chat_bookmarks_delete')}
                  type="button">
                  <FaTrash size={11} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default BookmarkList;
