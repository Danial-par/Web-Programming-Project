import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toPng } from "html-to-image";
import { listEvidence } from "../api/evidence";
import {
  BoardItem,
  BoardItemCreatePayload,
  DetectiveBoardState,
  createBoardItem,
  createBoardConnection,
  deleteBoardConnection,
  deleteBoardItem,
  getCaseBoard,
  moveBoardItem
} from "../api/investigations";
import { BoardItemCard } from "../components/board/BoardItemCard";
import { DetectiveBoardSkeleton } from "../components/board/DetectiveBoardSkeleton";
import { ApiErrorAlert } from "../components/ui/ApiErrorAlert";
import { BackToDashboardButton } from "../components/ui/BackToDashboardButton";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Select } from "../components/ui/Select";
import { useAsyncData } from "../hooks/useAsyncData";
import { getErrorMessage } from "../utils/errors";
import { useToast } from "../utils/toast";

const CANVAS_WIDTH = 2000;
const CANVAS_HEIGHT = 1200;
const ITEM_WIDTH = 240;
const ITEM_HEIGHT = 140;
const EVIDENCE_LABEL_MAX = 52;

function nextItemPosition(items: BoardItem[]) {
  const baseX = 60;
  const baseY = 70;
  const stepX = 34;
  const stepY = 26;
  const idx = items.length;
  return {
    x: (baseX + (idx * stepX) % 720) % (CANVAS_WIDTH - 260),
    y: (baseY + Math.floor((idx * stepX) / 720) * stepY) % (CANVAS_HEIGHT - 170)
  };
}

function shorten(text: string, max = EVIDENCE_LABEL_MAX) {
  const value = (text || "").trim();
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export const BoardPage: React.FC = () => {
  const { caseId } = useParams();
  const numericCaseId = Number(caseId);
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();

  const {
    data: boardData,
    isLoading: isBoardLoading,
    error: boardError,
    refetch: refetchBoard
  } = useAsyncData<DetectiveBoardState>(() => getCaseBoard(numericCaseId), [numericCaseId]);

  const {
    data: evidence,
    isLoading: isEvidenceLoading,
    error: evidenceError,
    refetch: refetchEvidence
  } = useAsyncData(() => listEvidence(numericCaseId), [numericCaseId]);

  const [board, setBoard] = useState<DetectiveBoardState | null>(null);
  const [noteText, setNoteText] = useState("");
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const [draggingItemId, setDraggingItemId] = useState<number | null>(null);
  const [isConnectionMode, setIsConnectionMode] = useState(false);
  const [connectionFromId, setConnectionFromId] = useState<number | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null);

  const boardRef = React.useRef<DetectiveBoardState | null>(null);
  const boardCanvasRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{
    itemId: number;
    startClientX: number;
    startClientY: number;
    startPosX: number;
    startPosY: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = React.useRef<{ itemId: number; until: number } | null>(null);

  useEffect(() => {
    if (boardData) {
      setBoard(boardData);
    }
  }, [boardData]);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    if (!selectedEvidenceId && evidence && evidence.length > 0) {
      setSelectedEvidenceId(String(evidence[0].id));
    }
  }, [evidence, selectedEvidenceId]);

  const evidenceOptions = useMemo(() => {
    if (!evidence) return [];
    return evidence.map((e) => ({
      value: String(e.id),
      label: `#${e.id} · ${shorten(e.title)}`
    }));
  }, [evidence]);

  const createItem = async (payload: BoardItemCreatePayload) => {
    try {
      setIsCreating(true);
      const created = await createBoardItem(numericCaseId, payload);
      setBoard((prev) =>
        prev
          ? {
              ...prev,
              items: [...prev.items, created]
            }
          : prev
      );
      showSuccess("Board item created.");
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateNote = async () => {
    if (!board) return;
    const trimmed = noteText.trim();
    if (!trimmed) {
      showError("Please enter a note.");
      return;
    }
    const position = nextItemPosition(board.items);
    await createItem({ kind: "note", note_text: trimmed, position });
    setNoteText("");
  };

  const handleAddEvidence = async () => {
    if (!board) return;
    if (!selectedEvidenceId) {
      showError("Select an evidence record first.");
      return;
    }
    const position = nextItemPosition(board.items);
    await createItem({ kind: "evidence", evidence_id: Number(selectedEvidenceId), position });
  };

  const handleDeleteItem = async (item: BoardItem) => {
    if (!board) return;
    const ok = window.confirm("Delete this board item?");
    if (!ok) return;
    try {
      await deleteBoardItem(numericCaseId, item.id);
      setBoard((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.filter((it) => it.id !== item.id),
              connections: prev.connections.filter((c) => c.from_item !== item.id && c.to_item !== item.id)
            }
          : prev
      );
      showSuccess("Board item deleted.");
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const itemsById = useMemo(() => {
    const map = new Map<number, BoardItem>();
    for (const it of board?.items ?? []) map.set(it.id, it);
    return map;
  }, [board]);

  const handleItemClick = (item: BoardItem) => {
    const suppress = suppressClickRef.current;
    if (suppress && suppress.itemId === item.id && suppress.until > Date.now()) {
      return;
    }

    if (isConnectionMode) {
      if (!connectionFromId) {
        setConnectionFromId(item.id);
        setSelectedConnectionId(null);
        return;
      }

      if (connectionFromId === item.id) {
        setConnectionFromId(null);
        return;
      }

      (async () => {
        try {
          const created = await createBoardConnection(numericCaseId, {
            from_item: connectionFromId,
            to_item: item.id
          });
          setBoard((prev) => {
            if (!prev) return prev;
            const exists = prev.connections.some((c) => c.id === created.id);
            return exists
              ? prev
              : {
                  ...prev,
                  connections: [...prev.connections, created]
                };
          });
          showSuccess("Connection created.");
          setConnectionFromId(null);
        } catch (err) {
          showError(getErrorMessage(err));
        }
      })();
      return;
    }

    // Default click behavior (not in connection mode):
    // - evidence items open the evidence detail page
    if (item.kind === "evidence" && item.evidence?.id) {
      navigate(`/evidence/${item.evidence.id}`);
    }
  };

  const handleDeleteSelectedConnection = async () => {
    if (!board || !selectedConnectionId) return;
    const ok = window.confirm("Delete this connection?");
    if (!ok) return;
    try {
      await deleteBoardConnection(numericCaseId, selectedConnectionId);
      setBoard((prev) =>
        prev
          ? {
              ...prev,
              connections: prev.connections.filter((c) => c.id !== selectedConnectionId)
            }
          : prev
      );
      setSelectedConnectionId(null);
      showSuccess("Connection deleted.");
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const handleExportBoard = async () => {
    if (!boardCanvasRef.current) {
      showError("Board canvas is not ready.");
      return;
    }
    try {
      const dataUrl = await toPng(boardCanvasRef.current, {
        cacheBust: true,
        backgroundColor: "#020617"
      });
      const link = document.createElement("a");
      link.download = `case-${numericCaseId}-board.png`;
      link.href = dataUrl;
      link.click();
      showSuccess("Board exported.");
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  useEffect(() => {
    const onPointerMove = (evt: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const dx = evt.clientX - drag.startClientX;
      const dy = evt.clientY - drag.startClientY;
      if (!drag.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        drag.moved = true;
      }

      const x = Math.max(0, Math.min(CANVAS_WIDTH - ITEM_WIDTH, drag.startPosX + dx));
      const y = Math.max(0, Math.min(CANVAS_HEIGHT - ITEM_HEIGHT, drag.startPosY + dy));

      setBoard((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((it) => (it.id === drag.itemId ? { ...it, position: { x, y } } : it))
            }
          : prev
      );
    };

    const onPointerUp = async () => {
      const drag = dragRef.current;
      if (!drag) return;

      dragRef.current = null;
      setDraggingItemId(null);

      const latest = boardRef.current;
      const movedItem = latest?.items.find((it) => it.id === drag.itemId);
      if (!movedItem) return;

      if (drag.moved) {
        suppressClickRef.current = { itemId: drag.itemId, until: Date.now() + 350 };
      }

      try {
        const saved = await moveBoardItem(numericCaseId, movedItem.id, movedItem.position);
        setBoard((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((it) => (it.id === saved.id ? saved : it))
              }
            : prev
        );
      } catch (err) {
        showError(getErrorMessage(err));
        // Re-fetch to restore canonical board state.
        refetchBoard();
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [numericCaseId, refetchBoard, showError]);

  const handleItemPointerDown = (evt: React.PointerEvent<HTMLDivElement>, item: BoardItem) => {
    if (isCreating) return;
    if (evt.button !== 0) return;
    if ((evt.target as HTMLElement | null)?.closest("button")) return;

    evt.preventDefault();
    evt.stopPropagation();
    setDraggingItemId(item.id);
    dragRef.current = {
      itemId: item.id,
      startClientX: evt.clientX,
      startClientY: evt.clientY,
      startPosX: item.position.x,
      startPosY: item.position.y,
      moved: false
    };
  };

  if (!caseId || Number.isNaN(numericCaseId)) {
    return (
      <div className="workflow-stack">
        <h1>Detective Board</h1>
        <ApiErrorAlert title="Invalid case id" error={new Error("Missing or invalid :caseId route param")} />
      </div>
    );
  }

  if (isBoardLoading || !board) {
    return (
      <div className="workflow-stack">
        <section className="workflow-header">
          <div>
            <h1 style={{ marginTop: 0 }}>Detective Board</h1>
            <p className="workflow-muted">Loading board for case #{numericCaseId}…</p>
          </div>
          <BackToDashboardButton />
        </section>
        <DetectiveBoardSkeleton />
      </div>
    );
  }

  return (
    <div className="workflow-stack">
      <section className="workflow-header">
        <div>
          <h1 style={{ marginTop: 0 }}>Detective Board</h1>
          <p className="workflow-muted">
            Pin notes and evidence for case #{numericCaseId}. You can open the case workspace{" "}
            <Link to={`/cases/${numericCaseId}`} className="workflow-link">
              here
            </Link>
            .
          </p>
        </div>
        <BackToDashboardButton />
      </section>

      {boardError && <ApiErrorAlert title="Failed to load board" error={boardError} onRetry={refetchBoard} />}
      {evidenceError && (
        <ApiErrorAlert title="Failed to load evidence list" error={evidenceError} onRetry={refetchEvidence} />
      )}

      <div className="board-shell">
        <div className="board-canvas-wrap" aria-label="Detective board canvas">
          <div ref={boardCanvasRef} className="board-canvas" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
            {/* Connections (SVG overlay) */}
            <svg
              className="board-connections"
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              role="presentation"
              aria-hidden="true"
              onClick={() => setSelectedConnectionId(null)}
            >
              {board.connections.map((c) => {
                const from = itemsById.get(c.from_item);
                const to = itemsById.get(c.to_item);
                if (!from || !to) return null;
                const x1 = from.position.x + ITEM_WIDTH / 2;
                const y1 = from.position.y + ITEM_HEIGHT / 2;
                const x2 = to.position.x + ITEM_WIDTH / 2;
                const y2 = to.position.y + ITEM_HEIGHT / 2;
                const selected = selectedConnectionId === c.id;
                return (
                  <line
                    key={c.id}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={selected ? "#f97373" : "#ef4444"}
                    strokeWidth={selected ? 4 : 2.5}
                    strokeLinecap="round"
                    opacity={selected ? 0.95 : 0.7}
                    style={{ cursor: "pointer" }}
                    onClick={(evt) => {
                      evt.stopPropagation();
                      setSelectedConnectionId(c.id);
                    }}
                  />
                );
              })}
            </svg>

            {board.items.map((item) => (
              <BoardItemCard
                key={item.id}
                item={item}
                onDelete={handleDeleteItem}
                onPointerDown={handleItemPointerDown}
                onClick={handleItemClick}
                isSelected={draggingItemId === item.id || connectionFromId === item.id}
                isConnectionCandidate={isConnectionMode && connectionFromId !== null && item.id !== connectionFromId}
              />
            ))}
          </div>
        </div>

        <aside className="board-side">
          <Card title="Board tools">
            <div className="board-tools">
              <div className="board-tools__section">
                <div className="board-tools__section-title">Connections</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.45 }}>
                  {isConnectionMode ? (
                    connectionFromId ? (
                      <>
                        Click a second item to connect to <strong>#{connectionFromId}</strong>. Or click it again to
                        reset.
                      </>
                    ) : (
                      <>Click an item to select as the first connection point.</>
                    )
                  ) : (
                    <>Enable connection mode to create red links between notes and evidence.</>
                  )}
                </div>
                <div className="workflow-actions">
                  <Button
                    type="button"
                    variant={isConnectionMode ? "secondary" : "primary"}
                    onClick={() => {
                      setIsConnectionMode((prev) => !prev);
                      setConnectionFromId(null);
                    }}
                  >
                    {isConnectionMode ? "Exit connection mode" : "Connection mode"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleDeleteSelectedConnection}
                    disabled={!selectedConnectionId}
                  >
                    Delete selected line
                  </Button>
                  <Button type="button" variant="secondary" onClick={handleExportBoard}>
                    Export PNG
                  </Button>
                </div>
                {selectedConnectionId && (
                  <div style={{ marginTop: "0.35rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Selected connection: <strong style={{ color: "var(--text)" }}>#{selectedConnectionId}</strong>
                  </div>
                )}
              </div>

              <div className="board-tools__section">
                <div className="board-tools__section-title">Create note</div>
                <textarea
                  className="ui-textarea"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Write a note to pin on the board…"
                  disabled={isCreating}
                />
                <div className="workflow-actions">
                  <Button type="button" onClick={handleCreateNote} disabled={isCreating}>
                    Add note
                  </Button>
                </div>
              </div>

              <div className="board-tools__section">
                <div className="board-tools__section-title">Add evidence</div>
                <Select
                  label="Evidence"
                  options={
                    evidenceOptions.length > 0
                      ? evidenceOptions
                      : [{ value: "", label: isEvidenceLoading ? "Loading…" : "No evidence found" }]
                  }
                  value={selectedEvidenceId}
                  onChange={(e) => setSelectedEvidenceId(e.target.value)}
                  disabled={isCreating || isEvidenceLoading || evidenceOptions.length === 0}
                />
                <div className="workflow-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleAddEvidence}
                    disabled={isCreating || isEvidenceLoading || evidenceOptions.length === 0}
                  >
                    Add evidence item
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
};
