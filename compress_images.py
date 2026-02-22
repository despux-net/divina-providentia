import os
from PIL import Image

def compress_images(directory, max_width=1600):
    valid_extensions = {'.png', '.jpg', '.jpeg'}
    total_saved = 0

    for root, _, files in os.walk(directory):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in valid_extensions:
                filepath = os.path.join(root, file)
                try:
                    original_size = os.path.getsize(filepath)
                    with Image.open(filepath) as img:
                        # Convert RGBA to RGB for JPEG keeping alpha for PNG
                        format_to_save = img.format
                        
                        # Resize if too large
                        if img.width > max_width:
                            ratio = max_width / img.width
                            new_height = int(img.height * ratio)
                            img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
                        
                        # Save with compression optimizations
                        if ext == '.png':
                            img.save(filepath, format='PNG', optimize=True)
                        else:
                            if img.mode in ("RGBA", "P"):
                                img = img.convert("RGB")
                            img.save(filepath, format='JPEG', optimize=True, quality=80)

                    new_size = os.path.getsize(filepath)
                    saved_mb = (original_size - new_size) / (1024 * 1024)
                    print(f"Optimized: {file} - Saved {saved_mb:.2f} MB")
                    total_saved += (original_size - new_size)
                except Exception as e:
                    print(f"Failed to process {file}: {e}")

    print(f"\nTotal space saved: {total_saved / (1024 * 1024):.2f} MB")

if __name__ == "__main__":
    compress_images(".", 1200) # Max width 1200 for really fast web loading
