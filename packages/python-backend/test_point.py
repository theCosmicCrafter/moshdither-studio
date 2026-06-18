import traceback, sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
try:
    import sam3_service
    img = r"C:\Users\richk\CascadeProjects\moshdither-studio\moshdither-screenshot.png"

    print("=== predict_batch (single point) ===")
    res = sam3_service.predict_batch(img, [(200, 200)], [])
    print(json.dumps({k: v for k, v in res.items() if k != "mask"}, indent=2))
    print("mask chars:", len(res.get("mask", "")))

    print("\n=== predict_point ===")
    res2 = sam3_service.predict_point(img, 200, 200)
    print(json.dumps({k: v for k, v in res2.items() if k != "mask"}, indent=2))
    print("mask chars:", len(res2.get("mask", "")))

except Exception:
    traceback.print_exc()
