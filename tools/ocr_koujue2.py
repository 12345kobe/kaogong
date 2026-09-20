# -*- coding: utf-8 -*-
import pymupdf, json, time, io
import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR
PDF = r"C:/Users/28621/xwechat_files/wxid_nbv2rd7682vc12_6706/msg/file/2026-09/11.0版常识88条速记口诀.pdf"
OUT = "tools/koujue_ocr2.json"
doc = pymupdf.open(PDF)
ocr = RapidOCR()
t0 = time.time()
pages = []
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=150)
    arr = np.array(Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB"))
    result, _ = ocr(arr)
    W, H = pix.width, pix.height
    items = []
    for r in (result or []):
        box, txt, conf = r[0], r[1], r[2]
        xs = [p[0] for p in box]; ys = [p[1] for p in box]
        items.append({"x0": min(xs)/W, "y0": min(ys)/H, "x1": max(xs)/W, "y1": max(ys)/H,
                      "yc": (min(ys)+max(ys))/2/H, "t": txt, "c": round(float(conf), 3)})
    pages.append({"page": i, "w": W, "h": H, "items": items})
    if i % 20 == 0:
        json.dump(pages, io.open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
        print("page %d/%d %.0fs" % (i, doc.page_count, time.time()-t0), flush=True)
json.dump(pages, io.open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
print("DONE", doc.page_count, "%.0fs" % (time.time()-t0))
