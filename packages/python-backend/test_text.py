import traceback, sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
try:
    import sam3_service
    img = r"C:\Users\richk\CascadeProjects\moshdither-studio\moshdither-screenshot.png"

    for prompt in ["screen", "ui", "interface", "icon"]:
        print(f"=== predict_text: '{prompt}' ===")
        res = sam3_service.predict_text(img, prompt)
        print(json.dumps({k: v for k, v in res.items() if k != "mask"}, indent=2))
        print("mask chars:", len(res.get("mask", "")))
        print()

except Exception:
    traceback.print_exc()
