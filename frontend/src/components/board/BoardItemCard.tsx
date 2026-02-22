import React from "react";
import { BoardItem } from "../../api/investigations";

export interface BoardItemCardProps {
  item: BoardItem;
  isSelected?: boolean;
  isConnectionCandidate?: boolean;
  onDelete?: (item: BoardItem) => void;
  onClick?: (item: BoardItem) => void;
  onPointerDown?: (evt: React.PointerEvent<HTMLDivElement>, item: BoardItem) => void;
}

export const BoardItemCard: React.FC<BoardItemCardProps> = ({
  item,
  isSelected,
  isConnectionCandidate,
  onDelete,
  onClick,
  onPointerDown
}) => {
  const title = item.kind === "note" ? "Note" : "Evidence";

  return (
    <div
      className={`board-item ${isSelected ? "board-item--selected" : ""} ${
        isConnectionCandidate ? "board-item--candidate" : ""
      }`.trim()}
      style={{ left: item.position.x, top: item.position.y }}
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(item)}
      onPointerDown={(evt) => onPointerDown?.(evt, item)}
      onKeyDown={(evt) => {
        if (evt.key === "Enter" || evt.key === " ") {
          evt.preventDefault();
          onClick?.(item);
        }
      }}
    >
      <div className="board-item__header">
        <div className="board-item__title">{title}</div>
        <button
          type="button"
          className="board-item__delete"
          aria-label="Delete item"
          onClick={(evt) => {
            evt.stopPropagation();
            onDelete?.(item);
          }}
        >
          ✕
        </button>
      </div>

      {item.kind === "note" ? (
        <div className="board-item__content">
          <div className="board-item__note">{item.note_text || "(empty note)"}</div>
        </div>
      ) : (
        <div className="board-item__content">
          <div className="board-item__evidence-title">{item.evidence?.title || "Evidence"}</div>
          <div className="board-item__evidence-meta">
            <span>
              <strong>ID:</strong> {item.evidence?.id ?? "—"}
            </span>
            <span>
              <strong>Type:</strong> {item.evidence?.type ?? "—"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};