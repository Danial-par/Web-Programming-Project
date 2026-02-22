import React from "react";
import { Skeleton } from "../ui/Skeleton";

export const DetectiveBoardSkeleton: React.FC = () => {
  return (
    <div className="board-shell">
      <div className="board-canvas-wrap">
        <div className="board-canvas" style={{ width: 2000, height: 1200, position: "relative" }}>
          <div style={{ position: "absolute", left: 60, top: 80, width: 240, height: 140 }}>
            <Skeleton height="1.1rem" width="60%" rounded={false} />
            <div style={{ marginTop: "0.6rem" }}>
              <Skeleton height="0.9rem" width="92%" rounded={false} />
            </div>
            <div style={{ marginTop: "0.4rem" }}>
              <Skeleton height="0.9rem" width="80%" rounded={false} />
            </div>
          </div>
          <div style={{ position: "absolute", left: 360, top: 220, width: 240, height: 140 }}>
            <Skeleton height="1.1rem" width="55%" rounded={false} />
            <div style={{ marginTop: "0.6rem" }}>
              <Skeleton height="0.9rem" width="88%" rounded={false} />
            </div>
            <div style={{ marginTop: "0.4rem" }}>
              <Skeleton height="0.9rem" width="72%" rounded={false} />
            </div>
          </div>
        </div>
      </div>

      <aside className="board-side">
        <div className="ui-card" style={{ padding: "1.25rem" }}>
          <Skeleton height="1.4rem" width="55%" rounded={false} />
          <div style={{ marginTop: "1rem", display: "grid", gap: "0.65rem" }}>
            <Skeleton height="0.9rem" width="80%" rounded={false} />
            <Skeleton height="2.2rem" width="100%" rounded={true} />
            <Skeleton height="2.2rem" width="70%" rounded={true} />
          </div>
        </div>
      </aside>
    </div>
  );
};