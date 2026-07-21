"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { X } from "lucide-react";

// Context lets nested forms close the modal without the parent (often a Server
// Component) having to pass a function child across the client boundary.
const ModalCtx = createContext<() => void>(() => {});

/** Call inside a form rendered within <Modal> to close it (e.g. on success). */
export function useCloseModal() {
  return useContext(ModalCtx);
}

export function Modal({
  trigger,
  title,
  children,
}: {
  trigger: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={close}
        >
          <div
            className="card w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{title}</h2>
              <button onClick={close} className="btn-ghost p-1.5" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <ModalCtx.Provider value={close}>{children}</ModalCtx.Provider>
          </div>
        </div>
      )}
    </>
  );
}
