import sys
import os

# Add backend to path
backend_path = os.path.join(os.getcwd(), "backend")
sys.path.append(backend_path)

try:
    print("Checking backend imports...")
    import main
    from services.whatsapp_service import wa_service
    from services.setting_service import global_settings
    from routers import superadmin, payments, webhook
    print("DONE: Backend imports successful. No syntax errors found.")
except Exception as e:
    print(f"ERROR: Backend import failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
