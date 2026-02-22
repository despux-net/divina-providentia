import os
import json
import hashlib
import shutil
from PIL import Image

STATE_FILE = ".optimized-images-state.json"
BACKUP_DIR = "_imagenes_originales"

def get_file_hash(filepath):
    hasher = hashlib.md5()
    try:
        with open(filepath, 'rb') as f:
            buf = f.read()
            hasher.update(buf)
        return hasher.hexdigest()
    except Exception:
        return None

def compress_images(directory=".", max_width=1600):
    valid_extensions = {'.png', '.jpg', '.jpeg'}
    total_saved = 0
    state = {}
    
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, 'r') as f:
                state = json.load(f)
        except:
            pass

    print("============================================================")
    print("Iniciando optimización de imágenes (Manteniendo originales)...")
    print("============================================================")

    for root, dirs, files in os.walk(directory):
        # Ignorar la carpeta de backup, git, node, y product-images (para no afectar otras lógicas)
        if any(skip in root for skip in [BACKUP_DIR, '.git', 'node_modules', 'product-images', 'supabase']):
            continue

        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in valid_extensions:
                filepath = os.path.join(root, file)
                rel_path = os.path.relpath(filepath, directory)
                
                # Revisar si se ha modificado la imagen revisando su hash MD5
                current_hash = get_file_hash(filepath)
                if not current_hash:
                    continue

                if state.get(rel_path) == current_hash:
                    continue # Ya estaba optimizada o es la misma!
                
                print(f"\n[*] Procesando imagen nueva o modificada: {rel_path}")
                
                # Es nueva o modificada! Respaldamos la versión original pesada
                backup_path = os.path.join(BACKUP_DIR, rel_path)
                os.makedirs(os.path.dirname(backup_path), exist_ok=True)
                
                try:
                    shutil.copy2(filepath, backup_path)
                except Exception as e:
                    print(f"❌ Error al respaldar original de {file}: {e}")
                    continue
                
                # Ahora comprimimos la del proyecto para la web
                original_size = os.path.getsize(filepath)
                try:
                    with Image.open(filepath) as img:
                        if img.width > max_width:
                            ratio = max_width / img.width
                            new_height = int(img.height * ratio)
                            img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
                        
                        if ext == '.png':
                            img.save(filepath, format='PNG', optimize=True)
                        else:
                            if img.mode in ("RGBA", "P"):
                                img = img.convert("RGB")
                            img.save(filepath, format='JPEG', optimize=True, quality=80)
                            
                    # Obtenemos el nuevo hash optimizado
                    new_size = os.path.getsize(filepath)
                    new_hash = get_file_hash(filepath)
                    
                    if new_hash:
                        state[rel_path] = new_hash
                    
                    saved_mb = (original_size - new_size) / (1024 * 1024)
                    print(f"✅ Optimizada - Se redujo {saved_mb:.2f} MB")
                    total_saved += max(0, original_size - new_size)
                    
                except Exception as e:
                    print(f"❌ Error al procesar {file}: {e}")
                    # Restauramos la original si falló
                    if os.path.exists(backup_path):
                        shutil.copy2(backup_path, filepath)

    # State config de imagenes para que recuerde
    try:
        with open(STATE_FILE, 'w') as f:
            json.dump(state, f, indent=2)
    except:
        pass

    if total_saved > 0:
        print(f"\n🎉 Increíble, has ahorrado {total_saved / (1024 * 1024):.2f} MB en total.")
    else:
        print("\n✨ Todas las imágenes en el proyecto ya están optimizadas.")
    print("============================================================\n")

if __name__ == "__main__":
    os.makedirs(BACKUP_DIR, exist_ok=True)
    # Se eligió ancho máximo 1200 para pantallas de computadoras estándar
    compress_images(".", 1200)
