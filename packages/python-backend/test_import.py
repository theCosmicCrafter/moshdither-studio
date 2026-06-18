import traceback, sys, os
sys.path.insert(0, os.path.dirname(__file__))
try:
    import sam3_service
    print("sam3_service import OK")
    print(sam3_service.list_models())
except Exception:
    traceback.print_exc()
