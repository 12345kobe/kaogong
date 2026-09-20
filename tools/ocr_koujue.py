# -*- coding: utf-8 -*-
import pymupdf, os, sys, time
from rapidocr_onnxruntime import RapidOCR
PDF = r"C:/Users/28621/xwechat_files/wxid_nbv2rd7682vc12_6706/msg/file/2026-09/11.0版常识88条速记口诀.pdf"
OUT = "tools/koujue_ocr.txt"
doc = pymupdf.open(PDF)
ocr = RapidOCR()
t0 = time.time()
buf = []
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=150)
    img = pix.tobytes("png")
    arr = None
    import numpy as np
    from PIL import Image
    import io
    arr = np.array(Image.open(io.BytesIO(img)).convert("RGB"))
    result, _ = ocr(arr)
    lines = [r[1] for r in (result or [])]
    buf.append("###PAGE %d###\n" % i + "\n".join(lines))
    if i % 10 == 0:
        with open(OUT, "w", encoding="utf-8") as f:
            f.write("\n".join(buf))
        print("page %d/%d elapsed %.0fs" % (i, doc.page_count, time.time()-t0), flush=True)
with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(buf))
print("DONE pages=%d elapsed=%.0fs" % (doc.page_count, time.time()-t0))
