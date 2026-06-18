import traceback, sys, os, json
sys.path.insert(0, os.path.dirname(__file__))

try:
    import sam3_service
    img = r"C:\Users\richk\CascadeProjects\moshdither-studio\moshdither-screenshot.png"

    print("=== Testing predict_text ===")
    res = sam3_service.predict_text(img, "window")
    print(json.dumps({k: v for k, v in res.items() if k != "mask"}, indent=2))
    print("mask length:", len(res.get("mask", "")))

    print("\n=== Testing predict_batch ===")
    res2 = sam3_service.predict_batch(img, [(200, 200)], [])
    print(json.dumps({k: v for k, v in res2.items() if k != "mask"}, indent=2))
    print("mask length:", len(res2.get("mask", "")))

    print("\n=== Testing predict_point ===")
    res3 = sam3_service.predict_point(img, 200, 200)
    print(json.dumps({k: v for k, v in res3.items() if k != "mask"}, indent=2))
    print("mask length:", len(res3.get("mask", "")))

except Exception:
    traceback.print_exc()
