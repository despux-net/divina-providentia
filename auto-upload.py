"""
Auto-Upload Product Images to Supabase
Watches the 'product-images' folder and automatically uploads new images
"""

import os
import time
import json
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import requests
from datetime import datetime

# Supabase Configuration
SUPABASE_URL = "https://nzwtafacdpdgulzcwntx.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56d3RhZmFjZHBkZ3VsemN3bnR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MjkxNDksImV4cCI6MjA4MTQwNTE0OX0.6elrAvcsEAc0Jaj4P8-ZFLSWKi2cvzgoAYGlDxeR-8U"

# Paths
SCRIPT_DIR = Path(__file__).parent
IMAGES_FOLDER = SCRIPT_DIR / "product-images"
PROCESSED_FILE = SCRIPT_DIR / ".processed-images.json"

# Supported image formats
SUPPORTED_FORMATS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}

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

processed = ProcessedImages()

def get_mime_type(extension):
    """Get MIME type from file extension"""
    mime_types = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
    }
    return mime_types.get(extension.lower(), 'application/octet-stream')

def upload_to_storage(file_path):
    """Upload image to Supabase Storage"""
    file_name = file_path.name
    file_ext = file_path.suffix
    timestamp = int(time.time() * 1000)
    storage_path = f"{timestamp}{file_ext}"
    
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
        print(f"   ✅ Uploaded to: {public_url}")
        return storage_path, public_url
    else:
        raise Exception(f"Upload failed: {response.status_code} - {response.text}")

def create_product(image_path, file_name):
    """Create product in Supabase database"""
    # Generate product name from filename
    product_name = file_name.stem.replace('-', ' ').replace('_', ' ').title()
    
    print(f"   📦 Creating product in database...")
    
    product_data = {
        'name': product_name,
        'description': 'Producto pendiente de descripción - Editar en Supabase',
        'price': 0,
        'category': 'vestments',  # Default category
        'image': image_path
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
        print(f"   ✅ Product created with ID: {product['id']}")
        return product
    else:
        raise Exception(f"Product creation failed: {response.status_code} - {response.text}")

def process_image(file_path):
    """Process a new image file"""
    file_name = file_path.name
    
    print(f"\n📸 Processing: {file_name}")
    
    try:
        # Upload to Storage
        storage_path, public_url = upload_to_storage(file_path)
        
        # Create product
        product = create_product(storage_path, file_path)
        
        # Mark as processed
        processed.mark_processed(file_name, product['id'], storage_path, public_url)
        
        print(f"   💡 Edit product details at:")
        print(f"      https://supabase.com/dashboard/project/nzwtafacdpdgulzcwntx/editor")
        print(f"   🎉 Success! Product '{product['name']}' ready for editing\n")
        
    except Exception as e:
        print(f"   ❌ Error: {str(e)}\n")

class ImageHandler(FileSystemEventHandler):
    """Handle file system events"""
    
    def on_created(self, event):
        if event.is_directory:
            return
        
        file_path = Path(event.src_path)
        
        # Check if it's a supported image format
        if file_path.suffix.lower() in SUPPORTED_FORMATS:
            # Check if not already processed
            if not processed.is_processed(file_path.name):
                # Wait a bit to ensure file is fully written
                time.sleep(1)
                if file_path.exists():
                    process_image(file_path)

def process_existing_images():
    """Process any existing unprocessed images"""
    if not IMAGES_FOLDER.exists():
        IMAGES_FOLDER.mkdir()
        print("✅ Created product-images folder\n")
        return
    
    image_files = [
        f for f in IMAGES_FOLDER.iterdir()
        if f.is_file() and f.suffix.lower() in SUPPORTED_FORMATS
        and not processed.is_processed(f.name)
    ]
    
    if image_files:
        print(f"📂 Found {len(image_files)} unprocessed image(s)\n")
        for image_file in image_files:
            process_image(image_file)

def main():
    """Main function"""
    print("=" * 60)
    print("🏛️  DIVINA PROVIDENTIA - Auto Upload System")
    print("=" * 60)
    print(f"\n👀 Watching folder: {IMAGES_FOLDER}")
    print(f"📝 Supported formats: {', '.join(SUPPORTED_FORMATS)}\n")
    
    # Process existing images
    process_existing_images()
    
    # Start watching for new images
    event_handler = ImageHandler()
    observer = Observer()
    observer.schedule(event_handler, str(IMAGES_FOLDER), recursive=False)
    observer.start()
    
    print("✨ Ready! Drop images in the product-images folder to auto-upload")
    print("   Press Ctrl+C to stop\n")
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n\n👋 Stopping auto-upload system...")
        observer.stop()
    
    observer.join()
    print("✅ Stopped\n")

if __name__ == "__main__":
    main()
