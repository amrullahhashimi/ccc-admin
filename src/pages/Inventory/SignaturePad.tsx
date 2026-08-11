import { useEffect, useRef, useState } from "react";

const TERMS = [
  "Motherboard work is not guaranteed and we are not liable for other damages on the board during the repair.",
  "The owner has backed up all the important data before handing the device over for inspection or repair.",
  "Canadian Cellular Communication Inc. management, staff or its agents are not liable for the device's termination (permanently disabled) due to any pre-existing conditions (e.g. water damage, software tampering, or impact damage).",
  "The owner must be ready to reply and confirm the repair cost via email, voicemail, call or text.",
  "Repaired or broken devices lose their water-resistant status and are not meant to be submerged even if sealed.",
  "All repaired devices must be paid for in full within thirty (30) days; otherwise the device will be kept in lieu of payment. There is no exception to this unless prior written consent was given by one of Canadian Cellular Communication employees.",
  "Canadian Cellular Communication Inc. will provide a thirty (30) day warranty on specific repair work done from the pickup date.",
  "Canadian Cellular Communication Inc. will hold your device no longer than a period of 6 months or 185 days, after which your device will be recycled, and we will not be responsible for your data or your device.",
];

// A modal that shows the terms + "I agree" checkbox, then a signature pad.
// onSave receives a PNG data URL.
export default function SignaturePad({ onSave, onClose }: { onSave: (dataUrl: string) => void; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [agreed, setAgreed] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const drawing = useRef(false);

  // Size the canvas to its display box (crisp on high-DPI).
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * ratio;
    c.height = rect.height * ratio;
    const ctx = c.getContext("2d");
    if (ctx) { ctx.scale(ratio, ratio); ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#111"; }
  }, [agreed]);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y); ctx.stroke();
    setHasInk(true);
  };
  const end = () => { drawing.current = false; };

  const clear = () => {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  const save = () => {
    if (!agreed || !hasInk) return;
    onSave(canvasRef.current!.toDataURL("image/png"));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Terms & Conditions</h2>
        <ol className="mt-3 max-h-52 space-y-1.5 overflow-auto rounded-lg border border-gray-200 p-4 text-xs leading-relaxed text-gray-600 dark:border-gray-700 dark:text-gray-400">
          {TERMS.map((t, i) => (<li key={i} className="flex gap-2"><span className="font-medium text-gray-400">{i + 1}.</span><span>{t}</span></li>))}
        </ol>

        <label className="mt-4 flex items-center gap-2.5 text-sm font-medium text-gray-800 dark:text-white/90">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="h-4 w-4" />
          I understand and agree to all terms and conditions mentioned above.
        </label>

        <div className={`mt-4 ${agreed ? "" : "pointer-events-none opacity-40"}`}>
          <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-400">Sign below</p>
          <canvas
            ref={canvasRef}
            className="h-40 w-full touch-none rounded-lg border border-gray-300 bg-white dark:border-gray-600"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
          />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button type="button" onClick={clear} className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Clear</button>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5">Cancel</button>
            <button type="button" onClick={save} disabled={!agreed || !hasInk} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">Save signature</button>
          </div>
        </div>
      </div>
    </div>
  );
}