import type { CSSProperties } from "react";

export function Skeleton({ width, height = 12, style }: { width?: CSSProperties["width"]; height?: number; style?: CSSProperties }) {
  return <span className="skeleton" style={{ width, height, ...style }} aria-hidden="true" />;
}
