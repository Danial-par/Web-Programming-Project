import React from "react";

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({ width = "100%", height = "1rem", rounded = true }) => {
  const style: React.CSSProperties = {
    width,
    height,
    borderRadius: rounded ? "999px" : "4px"
  };

  return <div className="ui-skeleton" style={style} />;
};

