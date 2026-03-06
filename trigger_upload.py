import time
import threading
from pathlib import Path
import importlib.util

# Load the auto-upload module dynamically because of the hyphen
spec = importlib.util.spec_from_file_location("auto_upload", "auto-upload.py")
auto_upload = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auto_upload)

print("Iniciando sincronización manual...")

# 1. Sync Lookbook (This function already syncs everything in the PORTADA folder)
print("1. Sincronizando Lookbook...")
auto_upload.sync_lookbook_folder()

# 2. Sync specific new product image
print("2. Procesando la nueva chaqueta jacketf.png...")
product_path = Path("product-images/jacketf.png")

if product_path.exists():
    # Only process if not already in processed tracking
    if not auto_upload.processed.is_processed(product_path.name):
        client = auto_upload.get_sheet_client()
        auto_upload.process_image(product_path, client)
    else:
        print(f"El archivo {product_path.name} ya está marcado como procesado.")
else:
    print(f"El archivo {product_path} no se encuentra.")

print("Sincronización manual completada.")
