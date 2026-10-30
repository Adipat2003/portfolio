"use client";

/** A static scene layer keeps decorative lighting inside the authored skyline. */
export default function AtlasScene({ children }: { children: React.ReactNode }) {
  return <div className="atlas-scene">{children}</div>;
}
