import traceback, sys, os
sys.path.insert(0, os.path.dirname(__file__))
try:
    import sam3_service
    img = r"C:\Users\richk\CascadeProjects\moshdither-studio\moshdither-screenshot.png"
    print(sam3_service.predict_text(img, "window"))
except Exception as e:
    traceback.print_exc()
