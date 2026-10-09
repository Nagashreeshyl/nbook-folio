"use client";

import { useNotebookContext } from "@/components/book/NotebookProvider";
import { useNotebookSession } from "@/components/book/NotebookGate";

/** Small stack of collaborator dots — no personal data beyond a display name. */
export function PresenceBar() {
  const notebook = useNotebookContext();
  const session = useNotebookSession();

  const others = notebook.presence.filter((entry) => entry.sessionId !== session.sessionId);
  if (others.length === 0) return null;

  const shown = others.slice(0, 4);
  const overflow = others.length - shown.length;

  return (
    <div
      className="flex items-center pe-1"
      title={others.map((entry) => `${entry.name} · ${entry.role}`).join("\n")}
    >
      <div className="flex -space-x-1.5 rtl:space-x-reverse">
        {shown.map((entry) => (
          <span
            key={entry.sessionId}
            className="h-6 w-6 rounded-full border-2 border-paper grid place-items-center font-mono text-[9px] font-bold text-white shrink-0"
            style={{ backgroundColor: entry.color }}
          >
            {entry.name.slice(0, 2).toUpperCase()}
          </span>
        ))}
        {overflow > 0 && (
          <span className="h-6 w-6 rounded-full border-2 border-paper bg-rule grid place-items-center font-mono text-[9px] font-bold text-ink-soft shrink-0">
            +{overflow}
          </span>
        )}
      </div>
    </div>
  );
}
