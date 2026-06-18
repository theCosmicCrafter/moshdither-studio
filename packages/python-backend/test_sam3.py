import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))

import sam3_service

print("=== list_models ===")
print(sam3_service.list_models())

img = r"C:\Users\richk\CascadeProjects\moshdither-studio\moshdither-screenshot.png"

print("=== predict_text ===")
res = sam3_service.predict_text(img, "window")
print(json.dumps({k: v for k, v in res.items() if k != "mask"}, indent=2))
print("mask chars:", len(res.get("mask", "")))

print("=== predict_batch ===")
res2 = sam3_service.predict_batch(img, [(200, 200)], [])
print(json.dumps({k: v for k, v in res2.items() if k != "mask"}, indent=2))
print("mask chars:", len(res2.get("mask", "")))
