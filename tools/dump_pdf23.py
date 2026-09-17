import fitz
P2 = r"C:/Users/28621/Desktop/常识/申论常用名言1000句（更新版） .pdf"
P3 = r"C:/Users/28621/Desktop/常识/申论各领域规范词 (1).pdf"

print("="*30, "PDF2 名言 pages 6-12", "="*30)
doc2 = fitz.open(P2)
for p in range(5, 12):
    t = doc2[p].get_text()
    print(f"\n----- PDF2 page {p+1} -----")
    print(t[:2500])

print("\n\n")
print("="*30, "PDF3 规范词 pages 1-6", "="*30)
doc3 = fitz.open(P3)
for p in range(0, 6):
    t = doc3[p].get_text()
    print(f"\n----- PDF3 page {p+1} -----")
    print(t[:2500])
doc2.close(); doc3.close()
