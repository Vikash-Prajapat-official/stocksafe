"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Camera barcode scanner (GS1 DataMatrix, Code 128, EAN, UPC, QR) using @zxing/browser.
 * Browsers only allow the camera on HTTPS pages or localhost; otherwise a clear message is shown
 * and the user can use a USB scanner (which types into the code box) or type the code.
 */
export function BarcodeScanner({ onCode, onClose }: { onCode: (text: string) => void; onClose: () => void }) {
  const t = useTranslations("scanner");
  const video = useRef<HTMLVideoElement>(null);
  const latest = useRef(onCode);
  latest.current = onCode;
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(t("insecure"));
        setStarting(false);
        return;
      }
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        const hints = new Map<number, unknown>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.CODE_128,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.QR_CODE,
        ]);
        const reader = new BrowserMultiFormatReader(hints as never);
        const handle: { controls?: { stop: () => void } } = {};
        handle.controls = await reader.decodeFromVideoDevice(undefined, video.current ?? undefined, (result) => {
          if (result && !cancelled) {
            cancelled = true;
            handle.controls?.stop();
            latest.current(result.getText());
          }
        });
        if (cancelled) handle.controls.stop();
        else stop = () => handle.controls?.stop();
        setStarting(false);
      } catch {
        setError(t("noCamera"));
        setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [t]);

  return (
    <div className="space-y-2 rounded-lg border bg-neutral-50 p-3" role="dialog" aria-label={t("title")}>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : (
        <>
          <video ref={video} className="aspect-video w-full max-w-sm rounded bg-black" muted playsInline />
          <p className="text-sm text-neutral-600" aria-live="polite">
            {starting ? t("starting") : t("point")}
          </p>
        </>
      )}
      <Button variant="outline" size="sm" onClick={onClose}>
        {t("close")}
      </Button>
    </div>
  );
}
