import React from "react";
import { Skeleton } from "./Skeleton";

export const PageSkeleton: React.FC = () => {
  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <Skeleton height="2rem" width="40%" />
      <Skeleton height="1rem" width="70%" />
      <div style={{ marginTop: "1rem", display: "grid", gap: "0.75rem" }}>
        <Skeleton height="1.5rem" />
        <Skeleton height="1.5rem" />
        <Skeleton height="1.5rem" />
      </div>
    </div>
  );
};
