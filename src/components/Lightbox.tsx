// Any picture in a transcript, full-screen. One viewer for all three kinds —
// a frame of the bot's desktop, an image it generated, a file the user
// attached — so an expanded image behaves the same wherever it came from.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { stepIndex } from "@/lib/lightbox";

/** Put this on an <img> to make it expandable; `data-caption` is optional
 * and shows under the expanded picture. */
export const EXPANDABLE = { "data-lightbox": "" } as const;

type Shot = { src: string; alt: string; caption?: string };

/** Only `open` is published, and it never changes identity, so a memoized
 * transcript does not re-render when the viewer opens or closes. */
const LightboxContext = createContext<((from: HTMLImageElement) => void) | null>(null);

export function useLightbox() {
  return useContext(LightboxContext);
}

/** The siblings to page through are whichever expandable images are on
 * screen, in the order they appear. Reading them from the document at open
 * time — rather than threading a list down through the message list — keeps
 * the transcript's props stable and can never disagree with what is
 * rendered. */
function shotsFrom(clicked: HTMLImageElement): { shots: Shot[]; index: number } {
  const images = Array.from(document.querySelectorAll<HTMLImageElement>("img[data-lightbox]"));
  const shots = images.map((img) => ({
    src: img.currentSrc || img.src,
    alt: img.alt,
    caption: img.dataset.caption,
  }));
  const index = images.indexOf(clicked);
  return index === -1
    ? { shots: [{ src: clicked.currentSrc || clicked.src, alt: clicked.alt, caption: clicked.dataset.caption }], index: 0 }
    : { shots, index };
}

export function LightboxProvider({ children }: { children: React.ReactNode }) {
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [index, setIndex] = useState(0);
  // fit-to-window is the default; a click swaps to full size for detail
  const [actualSize, setActualSize] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const open = useCallback((from: HTMLImageElement) => {
    const found = shotsFrom(from);
    setShots(found.shots);
    setIndex(found.index);
    setActualSize(false);
  }, []);

  const close = useCallback(() => setShots(null), []);

  useEffect(() => {
    if (!shots) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setIndex((i) => stepIndex(i, shots.length, 1));
        setActualSize(false);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((i) => stepIndex(i, shots.length, -1));
        setActualSize(false);
      } else if (event.key === "Tab") {
        // nothing here is reachable behind the overlay, so the trap is just
        // "keep focus on the dialog"
        event.preventDefault();
        dialogRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previousFocus?.focus();
    };
  }, [shots, close]);

  const shot = shots?.[index];

  return (
    <LightboxContext.Provider value={open}>
      {children}
      {shot && (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-black/85"
          onMouseDown={(e) => e.target === e.currentTarget && close()}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={shot.alt || "Expanded image"}
            tabIndex={-1}
            className="relative flex min-h-0 flex-1 flex-col outline-none"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-[12.5px] text-white/70">
              <span className="min-w-0 flex-1 truncate" title={shot.caption}>
                {shot.caption}
              </span>
              {shots.length > 1 && (
                <span className="shrink-0 tabular-nums">
                  {index + 1} / {shots.length}
                </span>
              )}
              <button
                onClick={close}
                aria-label="Close"
                className="shrink-0 rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div
              className={cn(
                "flex min-h-0 flex-1 items-center justify-center px-4 pb-4",
                actualSize && "overflow-auto",
              )}
              onMouseDown={(e) => e.target === e.currentTarget && close()}
            >
              <img
                src={shot.src}
                alt={shot.alt}
                onClick={() => setActualSize((v) => !v)}
                className={cn(
                  "rounded-lg",
                  actualSize ? "max-w-none cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in object-contain",
                )}
              />
            </div>

            {shots.length > 1 && (
              <>
                <Arrow
                  side="left"
                  onClick={() => {
                    setIndex((i) => stepIndex(i, shots.length, -1));
                    setActualSize(false);
                  }}
                />
                <Arrow
                  side="right"
                  onClick={() => {
                    setIndex((i) => stepIndex(i, shots.length, 1));
                    setActualSize(false);
                  }}
                />
              </>
            )}
          </div>
        </div>
      )}
    </LightboxContext.Provider>
  );
}

function Arrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={onClick}
      aria-label={side === "left" ? "Previous image" : "Next image"}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white/80 hover:bg-white/20 hover:text-white",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <Icon size={22} />
    </button>
  );
}

/** An expandable <img>. Everything that shows a picture in a transcript goes
 * through this so the click target, the alt text and the caption stay
 * consistent. */
export function ExpandableImage({
  src,
  alt,
  caption,
  className,
}: {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
}) {
  const open = useLightbox();
  return (
    <img
      {...EXPANDABLE}
      data-caption={caption}
      src={src}
      alt={alt}
      onClick={(e) => open?.(e.currentTarget)}
      className={cn("cursor-zoom-in", className)}
    />
  );
}
