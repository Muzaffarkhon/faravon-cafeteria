import "server-only";
import QRCode from "qrcode";

/** SVG-разметка QR-кода для встраивания (dangerouslySetInnerHTML). */
export function couponQrSvg(text: string, size = 132): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    width: size,
    color: { dark: "#1f1a17", light: "#ffffff" },
  });
}
