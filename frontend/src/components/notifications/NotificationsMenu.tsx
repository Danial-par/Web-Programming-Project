import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { listNotifications, NotificationRecord } from "../../api/investigations";
import { useToast } from "../../utils/toast";
import { formatDateTime } from "../../utils/format";
import { getErrorMessage } from "../../utils/errors";
import { Skeleton } from "../ui/Skeleton";

export const NotificationsMenu: React.FC = () => {
  const { showError } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const unread = await listNotifications({ unread: true });
      setUnreadCount(unread.length);
    } catch (err) {
      // Keep polling silent; we don't want to spam toasts every 30s.
      setUnreadCount((prev) => prev);
    }
  }, []);

  const refreshList = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const all = await listNotifications();
      setNotifications(all);
      const unread = all.filter((n) => !n.read_at).length;
      setUnreadCount(unread);
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      showError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    // Initial unread count fetch + polling.
    refreshUnreadCount();
    pollTimerRef.current = window.setInterval(() => {
      refreshUnreadCount();
    }, 30_000);

    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [refreshUnreadCount]);

  useEffect(() => {
    if (!isOpen) return;

    const onDocMouseDown = (evt: MouseEvent) => {
      const node = evt.target as Node | null;
      if (!node) return;
      if (rootRef.current && !rootRef.current.contains(node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      refreshList();
    }
  }, [isOpen, refreshList]);

  const visibleNotifications = useMemo(() => notifications.slice(0, 12), [notifications]);

  return (
    <div className="notifications-menu" ref={rootRef}>
      <button
        type="button"
        className="notifications-button"
        aria-label="Open notifications"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && (
          <span className="notifications-badge" aria-label={`${unreadCount} unread notifications`}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notifications-dropdown" role="dialog" aria-label="Notifications">
          <div className="notifications-dropdown__header">
            <div>
              <div className="notifications-dropdown__title">Notifications</div>
              <div className="notifications-dropdown__subtitle">
                {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
              </div>
            </div>
            <button type="button" className="notifications-dropdown__close" onClick={() => setIsOpen(false)}>
              ✕
            </button>
          </div>

          {isLoading && (
            <div className="notifications-dropdown__body" style={{ display: "grid", gap: "0.75rem" }}>
              <Skeleton height="1.2rem" width="80%" rounded={false} />
              <Skeleton height="0.9rem" width="90%" rounded={false} />
              <Skeleton height="1.2rem" width="75%" rounded={false} />
              <Skeleton height="0.9rem" width="95%" rounded={false} />
            </div>
          )}

          {!isLoading && error && (
            <div className="notifications-dropdown__body">
              <div className="ui-error">{error}</div>
            </div>
          )}

          {!isLoading && !error && visibleNotifications.length === 0 && (
            <div className="notifications-dropdown__body">
              <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No notifications yet.</div>
            </div>
          )}

          {!isLoading && !error && visibleNotifications.length > 0 && (
            <div className="notifications-dropdown__body">
              {visibleNotifications.map((n) => {
                const unread = !n.read_at;
                return (
                  <Link
                    to={`/cases/${n.case}`}
                    key={n.id}
                    className={`notifications-item ${unread ? "notifications-item--unread" : ""}`.trim()}
                    onClick={() => setIsOpen(false)}
                  >
                    <div className="notifications-item__top">
                      <div className="notifications-item__case">{n.case_title || `Case #${n.case}`}</div>
                      <div className="notifications-item__time">{formatDateTime(n.created_at)}</div>
                    </div>
                    <div className="notifications-item__message">{n.message}</div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};