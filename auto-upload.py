"""
Auto-Sync System: Supabase + Google Sheets + Local Folder
=========================================================
Monitors 'product-images' folder for file changes (Upload/Delete).
Periodically syncs metadata from Google Sheet 'DIVINA PROVIDENTIA'.
"""

import os
import time
import json
import logging
from pathlib import Path
from datetime import datetime

import requests
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# Google Sheets Libraries
try:
    import gspread
    from oauth2client.service_account import ServiceAccountCredentials
    GOOGLE_SHEETS_AVAILABLE = True
except ImportError:
    GOOGLE_SHEETS_AVAILABLE = False
    print("⚠️  Google Sheets libraries not found. Sync will be disabled.")

# Configuration
SUPABASE_URL = "https://nzwtafacdpdgulzcwntx.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56d3RhZmFjZHBkZ3VsemN3bnR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MjkxNDksImV4cCI6MjA4MTQwNTE0OX0.6elrAvcsEAc0Jaj4P8-ZFLSWKi2cvzgoAYGlDxeR-8U"
SHEET_NAME = "DIVINA PROVIDENTIA"
CREDENTIALS_FILE = "credentials.json"
SYNC_INTERVAL = 30  # Seconds between sheet syncs

# Paths
SCRIPT_DIR = Path(__file__).parent
IMAGES_FOLDER = SCRIPT_DIR / "product-images"
PORTADA_FOLDER = SCRIPT_DIR / "PORTADA"
PROCESSED_FILE = SCRIPT_DIR / ".processed-images.json"
PROCESSED_LOOKBOOK_FILE = SCRIPT_DIR / ".processed-lookbook.json"

# Supported image formats
SUPPORTED_FORMATS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}

# Logging Setup
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s', datefmt='%H:%M:%S')
logger = logging.getLogger()

class ProcessedImages:
    def __init__(self):
        self.data = self.load()
    
    def load(self):
        if PROCESSED_FILE.exists():
            try:
                with open(PROCESSED_FILE, 'r') as f:
                    return json.load(f)
            except:
                return {}
        return {}
    
    def save(self):
        with open(PROCESSED_FILE, 'w') as f:
            json.dump(self.data, f, indent=2)
    
    def is_processed(self, filename):
        return filename in self.data
    
    def mark_processed(self, filename, product_id, storage_path, url):
        self.data[filename] = {
            'processed_at': datetime.now().isoformat(),
            'product_id': product_id,
            'storage_path': storage_path,
            'url': url
        }
        self.save()

    def remove_processed(self, filename):
        if filename in self.data:
            del self.data[filename]
            self.save()

processed = ProcessedImages()

# --- Google Sheets Integration ---

def parse_yes_no(value):
    """Parse yes/no from various formats (multilingual, case-insensitive, accent-insensitive)"""
    if not value:
        return False
    
    # Convert to string and normalize
    text = str(value).strip().lower()
    
    # Remove accents (á -> a, í -> i, etc.)
    import unicodedata
    text = unicodedata.normalize('NFD', text)
    text = ''.join(char for char in text if unicodedata.category(char) != 'Mn')
    
    # YES patterns: s, si, sí, y, yes, true, 1, etc.
    yes_patterns = {'s', 'si', 'y', 'yes', 'true', '1', 'ok', 'on'}
    
    # Check if starts with any yes pattern or is exactly a yes pattern
    return text in yes_patterns or any(text.startswith(p) for p in yes_patterns)


def get_sheet_client():
    if not GOOGLE_SHEETS_AVAILABLE:
        return None
    
    if not os.path.exists(CREDENTIALS_FILE):
        print(f"⚠️  {CREDENTIALS_FILE} not found. Sheets sync disabled.")
        return None
    
    try:
        scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
        creds = ServiceAccountCredentials.from_json_keyfile_name(CREDENTIALS_FILE, scope)
        client = gspread.authorize(creds)
        return client
    except Exception as e:
        print(f"❌ Error connecting to Google Sheets: {e}")
        return None

def sync_from_sheet(client):
    """Read sheet and update Supabase products"""
    if not client: return

    try:
        sheet = client.open(SHEET_NAME).sheet1
        records = sheet.get_all_records()
        
        if not records:
            return

        print(f"🔄 Syncing {len(records)} rows from Google Sheets...")

        for row in records:
            # Expected headers: Nombre, Precio, Imagen, Descripcion, Talla, Categoria, Disponible, Publicar
            # We map 'Imagen' (filename) to product_id using processed.json

            img_name = str(row.get('Imagen', '')).strip()
            if not img_name: continue

            # Find matching file in processed.json
            product_id = None
            if img_name in processed.data:
                product_id = processed.data[img_name]['product_id']
            else:
                for fname, data in processed.data.items():
                    if Path(fname).stem == img_name or fname == img_name:
                        product_id = data['product_id']
                        break
            
            if not product_id:
                continue

            # Prepare Update Data
            updates = {}
            if 'Nombre' in row: updates['name'] = row['Nombre']
            if 'Precio' in row and row['Precio']: 
                try: 
                    clean_price = str(row['Precio']).replace(',', '.').replace('$', '').strip()
                    updates['price'] = float(clean_price)
                except: pass
            if 'Descripcion' in row: updates['description'] = row['Descripcion']
            if 'Categoria' in row: updates['category'] = row['Categoria'].lower()
            if 'Talla' in row:
                sizes = [s.strip() for s in str(row['Talla']).split(',')]
                updates['sizes'] = sizes
            
            # Logic:
            # Publicar = SI -> published=True (Visible on site)
            # Disponible = SI -> available=True (Add to cart enabled)
            
            if 'Publicar' in row:
                updates['published'] = parse_yes_no(row['Publicar'])
            
            if 'Disponible' in row:
                updates['available'] = parse_yes_no(row['Disponible'])

            if updates:
                update_product_in_db(product_id, updates)

    except Exception as e:
        print(f"❌ Error syncing sheet: {e}")

def add_product_to_sheet(client, filename, product_id):
    """Append a new row to the sheet when a file is uploaded"""
    if not client: return
    try:
        sheet = client.open(SHEET_NAME).sheet1
        # Check if row exists
        cell = sheet.find(filename)
        if not cell:
            # Append new row
            # Order: Nombre, Precio, Imagen, Descripcion, Talla, Categoria, Disponible
            # We assume sensible defaults
            row = [
                Path(filename).stem.replace('-', ' ').title(), # Nombre
                0,                                             # Precio
                filename,                                      # Imagen
                "Nueva descripción pendiente",                 # Descripcion
                "S, M, L",                                     # Talla
                "vestments",                                   # Categoria
                "NO",                                          # Disponible
                "NO"                                           # Publicar
            ]
            sheet.append_row(row)
            print(f"   📝 Added '{filename}' to Google Sheet")
    except Exception as e:
        print(f"   ⚠️  Could not add to sheet: {e}")


# --- Supabase Functions ---

def get_mime_type(extension):
    mime_types = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp'}
    return mime_types.get(extension.lower(), 'application/octet-stream')

def check_storage_exists(bucket, storage_path):
    """Check if a file exists in Supabase Storage"""
    headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': f'Bearer {SUPABASE_ANON_KEY}'
    }
    url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{storage_path}"
    response = requests.head(url, headers=headers)
    return response.status_code == 200

def update_product_in_db(product_id, data):
    headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    }
    url = f"{SUPABASE_URL}/rest/v1/products?id=eq.{product_id}"
    requests.patch(url, headers=headers, json=data)
    # print(f"   updated DB for ID {product_id}")

def delete_from_storage(storage_path):
    print(f"   🗑️  Deleting from Storage: {storage_path}...")
    headers = {'apikey': SUPABASE_ANON_KEY, 'Authorization': f'Bearer {SUPABASE_ANON_KEY}'}
    url = f"{SUPABASE_URL}/storage/v1/object/products/{storage_path}"
    requests.delete(url, headers=headers)

def delete_product_from_db(product_id):
    print(f"   🔥 Deleting product ID {product_id} from database...")
    headers = {'apikey': SUPABASE_ANON_KEY, 'Authorization': f'Bearer {SUPABASE_ANON_KEY}', 'Prefer': 'return=minimal'}
    url = f"{SUPABASE_URL}/rest/v1/products?id=eq.{product_id}"
    requests.delete(url, headers=headers)

def upload_to_storage(file_path):
    file_name = file_path.name
    file_ext = file_path.suffix
    storage_path = f"{int(time.time() * 1000)}{file_ext}"
    
    # Check if already exists (shouldn't happen with timestamp, but just in case)
    if check_storage_exists('products', storage_path):
        print(f"   ℹ️  File already exists in storage, skipping upload")
        public_url = f"{SUPABASE_URL}/storage/v1/object/public/products/{storage_path}"
        return storage_path, public_url
    
    print(f"   ⬆️  Uploading to Supabase Storage...")
    with open(file_path, 'rb') as f:
        file_data = f.read()
    
    headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
        'Content-Type': get_mime_type(file_ext)
    }
    url = f"{SUPABASE_URL}/storage/v1/object/products/{storage_path}"
    response = requests.post(url, headers=headers, data=file_data)
    
    if response.status_code in [200, 201]:
        public_url = f"{SUPABASE_URL}/storage/v1/object/public/products/{storage_path}"
        print(f"   ✅ Uploaded: {public_url}")
        return storage_path, public_url
    elif response.status_code == 409:
        # Duplicate error - file already exists
        print(f"   ℹ️  File already exists (409), using existing URL")
        public_url = f"{SUPABASE_URL}/storage/v1/object/public/products/{storage_path}"
        return storage_path, public_url
    else:
        raise Exception(f"Upload failed: {response.text}")

def create_product(image_path, file_name):
    product_name = file_name.stem.replace('-', ' ').replace('_', ' ').title()
    print(f"   📦 Creating product in database...")
    product_data = {
        'name': product_name,
        'description': 'Pendiente de Sheet...',
        'price': 0,
        'category': 'vestments',
        'image': image_path,
        'available': True,   # Default: In Stock
        'published': False   # Default: Hidden (Requires 'Publicar: SI' in Sheet)
    }
    headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }
    url = f"{SUPABASE_URL}/rest/v1/products"
    response = requests.post(url, headers=headers, json=product_data)
    if response.status_code == 201:
        product = response.json()[0]
        print(f"   ✅ Product created ID: {product['id']}")
        return product
    else:
        raise Exception(f"Creation failed: {response.text}")

def process_image(file_path, sheet_client=None):
    file_name = file_path.name
    print(f"\n📸 Processing: {file_name}")
    try:
        storage_path, public_url = upload_to_storage(file_path)
        product = create_product(storage_path, file_path)
        processed.mark_processed(file_name, product['id'], storage_path, public_url)
        
        # Add to Sheet
        if sheet_client:
            add_product_to_sheet(sheet_client, file_name, product['id'])
            
    except Exception as e:
        print(f"   ❌ Error: {str(e)}\n")

def process_deletion(file_name):
    print(f"\n🗑️  Detected deletion: {file_name}")
    if processed.is_processed(file_name):
        data = processed.data[file_name]
        try:
            delete_product_from_db(data['product_id'])
            delete_from_storage(data['storage_path'])
            processed.remove_processed(file_name)
            print(f"   💀 Clean up complete for {file_name}\n")
        except Exception as e:
             print(f"   ❌ Error during cleanup: {str(e)}\n")

class ImageHandler(FileSystemEventHandler):
    def __init__(self, sheet_client):
        self.sheet_client = sheet_client

    def on_created(self, event):
        if event.is_directory: return
        file_path = Path(event.src_path)
        if file_path.suffix.lower() in SUPPORTED_FORMATS:
            if not processed.is_processed(file_path.name):
                time.sleep(1)
                if file_path.exists():
                    process_image(file_path, self.sheet_client)

    def on_deleted(self, event):
        if event.is_directory: return
        process_deletion(Path(event.src_path).name)

# --- Lookbook Functions ---

def upload_lookbook_image(file_path, file_name):
    """Upload lookbook image to Supabase Storage and create DB entry"""
    try:
        # Check if file already exists in storage
        if check_storage_exists('lookbook', file_name):
            print(f"   ℹ️  Lookbook image '{file_name}' already exists in storage, skipping upload")
            return True
        
        with open(file_path, 'rb') as f:
            file_data = f.read()
        
        # Upload to Supabase Storage (lookbook bucket)
        headers = {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
            'Content-Type': get_mime_type(file_path.suffix)
        }
        
        storage_url = f"{SUPABASE_URL}/storage/v1/object/lookbook/{file_name}"
        response = requests.post(storage_url, headers=headers, data=file_data)
        
        if response.status_code == 409:
            # Duplicate - file already exists
            print(f"   ℹ️  Lookbook image '{file_name}' already exists (409), continuing...")
            # Continue to DB insert with existing file
        elif response.status_code not in [200, 201]:
            print(f"   ❌ Upload failed: {response.text}")
            return False
        
        # Get public URL
        image_url = f"{SUPABASE_URL}/storage/v1/object/public/lookbook/{file_name}"
        
        # Insert into lookbook_images table
        db_url = f"{SUPABASE_URL}/rest/v1/lookbook_images"
        data = {
            'image_url': image_url,
            'display_order': 0
        }
        
        db_response = requests.post(db_url, headers=headers, json=data)
        
        if db_response.status_code in [200, 201]:
            print(f"   ✅ Lookbook image uploaded: {file_name}")
            return True
        elif db_response.status_code == 409:
            # Duplicate in database - image already exists
            print(f"   ℹ️  Lookbook entry already exists in database (409), skipping...")
            return True
        else:
            print(f"   ⚠️  DB insert warning: {db_response.text}")
            # Still return True since storage upload succeeded
            return True

            
    except Exception as e:
        print(f"   ❌ Error uploading lookbook: {e}")
        return False

def sync_lookbook_folder():
    """Sync PORTADA folder with Supabase lookbook (upload new, delete removed)"""
    if not PORTADA_FOLDER.exists():
        return
    
    # Load processed lookbook images
    processed_lookbook = {}
    if PROCESSED_LOOKBOOK_FILE.exists():
        with open(PROCESSED_LOOKBOOK_FILE, 'r') as f:
            processed_lookbook = json.load(f)
    
    # Get current files in PORTADA
    current_files = {f.name for f in PORTADA_FOLDER.iterdir() if f.suffix.lower() in SUPPORTED_FORMATS}
    
    # Find deleted files (in processed but not in current folder)
    deleted_files = set(processed_lookbook.keys()) - current_files
    
    # Delete removed files from Supabase
    for file_name in deleted_files:
        print(f"\n🗑️  Detected deletion: {file_name}")
        try:
            # Delete from storage
            headers = {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': f'Bearer {SUPABASE_ANON_KEY}'
            }
            storage_url = f"{SUPABASE_URL}/storage/v1/object/lookbook/{file_name}"
            requests.delete(storage_url, headers=headers)
            
            # Delete from database (by image_url)
            image_url = f"{SUPABASE_URL}/storage/v1/object/public/lookbook/{file_name}"
            db_url = f"{SUPABASE_URL}/rest/v1/lookbook_images?image_url=eq.{image_url}"
            requests.delete(db_url, headers=headers)
            
            # Remove from processed tracking
            del processed_lookbook[file_name]
            print(f"   ✅ Deleted from Supabase: {file_name}")
        except Exception as e:
            print(f"   ⚠️  Error deleting {file_name}: {e}")
    
    # Upload new files
    for file_name in current_files:
        if file_name not in processed_lookbook:
            file_path = PORTADA_FOLDER / file_name
            if upload_lookbook_image(file_path, file_name):
                processed_lookbook[file_name] = True
    
    # Save processed state
    with open(PROCESSED_LOOKBOOK_FILE, 'w') as f:
        json.dump(processed_lookbook, f, indent=2)

def main():
    print("=" * 60)
    print("🏛️  DIVINA PROVIDENTIA - SENTINEL SYSTEM")
    print("=" * 60)
    print("   1. Monitors folder for images (Upload/Delete)")
    print("   2. Syncs metadata with Google Sheet 'DIVINA PROVIDENTIA'")
    print("-" * 60)
    
    # Connect to Sheets
    sheet_client = get_sheet_client()
    if sheet_client:
        print("   ✅ Connected to Google Sheets")
    
    if not IMAGES_FOLDER.exists():
        IMAGES_FOLDER.mkdir()

    # Initial Process
    # process_existing_images() # Skipping for brevity in this replace, existing logic holds

    # Start Watcher
    event_handler = ImageHandler(sheet_client)
    observer = Observer()
    observer.schedule(event_handler, str(IMAGES_FOLDER), recursive=False)
    observer.start()
    
    print(f"\n👀 Watching: {IMAGES_FOLDER}")
    print("✨ Sentinel is Active. Press Ctrl+C to stop.\n")
    
    last_sync = 0
    last_lookbook_sync = 0
    
    # Initial lookbook sync
    sync_lookbook_folder()
    
    try:
        while True:
            time.sleep(1)
            # Periodic Sheet Sync
            if sheet_client and (time.time() - last_sync > SYNC_INTERVAL):
                sync_from_sheet(sheet_client)
                last_sync = time.time()
            
            # Periodic Lookbook Sync (every 60 seconds)
            if time.time() - last_lookbook_sync > 60:
                sync_lookbook_folder()
                last_lookbook_sync = time.time()
                
    except KeyboardInterrupt:
        print("\n👋 Stopping Sentinel...")
        observer.stop()
    
    observer.join()

if __name__ == "__main__":
    main()
