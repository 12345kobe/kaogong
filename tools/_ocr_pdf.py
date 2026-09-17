# -*- coding: utf-8 -*-
"""对扫描/转曲 PDF 做 OCR，输出每页每行的文本 + 坐标（供后续按原排版重建）"""
import sys, json, time, os
import fitz
import numpy as np
from rapidocr_onnxruntime import RapidOCR

SRC = sys.argv[1]
OUT = sys.argv[2]
DPI = int(sys.argv[3]) if len(sys.argv) > 3 else 200
START = int(sys.argv[4]) if len(sys.argv) > 4 else 0
END = int(sys.argv[5]) if len(sys.argv) > 5 else 0

def main():
    doc = fitz.open(SRC)
    n = doc.page_count
    end = END if END else n
    ocr = RapidOCR()
    pages = []
    t0 = time.time()
    for i in range(START, end):
        pg = doc[i]
        pix = pg.get_pixmap(dpi=DPI)
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        if pix.n == 4:
            img = img[:, :, :3]
        res, _ = ocr(img)
        lines = []
        for r in (res or []):
            box, text, conf = r[0], r[1], r[2]
            xs = [p[0] for p in box]; ys = [p[1] for p in box]
            lines.append({
                "t": text,
                "x0": round(min(xs) / DPI * 72, 1),
                "x1": round(max(xs) / DPI * 72, 1),
                "y0": round(min(ys) / DPI * 72, 1),
                "y1": round(max(ys) / DPI * 72, 1),
                "c": round(float(conf), 3)
            })
        lines.sort(key=lambda l: (l["y0"], l["x0"]))
        pages.append({"page": i, "lines": lines})
        print(f"  p{i+1}/{end}  {len(lines)} 行  {time.time()-t0:.0f}s", flush=True)
    doc.close()
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"src": SRC, "dpi": DPI, "pages": pages}, f, ensure_ascii=False)
    print("saved", OUT, f"{time.time()-t0:.0f}s")

if __name__ == "__main__":
    main()
