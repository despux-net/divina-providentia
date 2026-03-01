import os
import math
import sys
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

def build_dzi(source_path, basename):
    print(f'Cargando imagen completa: {source_path}...')
    try:
        img = Image.open(source_path)
    except Exception as e:
        print(f"Error abriendo imagen: {e}")
        return
        
    width, height = img.size
    print(f'Resolución Original Detectada: {width} x {height} píxeles')
    
    # Format settings compatibles con OpenSeadragon
    tile_size = 512
    overlap = 1
    
    # Calculate levels of the pyramid
    max_dimension = max(width, height)
    num_levels = int(math.ceil(math.log(max_dimension, 2))) + 1
    
    print(f'Generando {num_levels} niveles de profundidad zoom...')
    
    # Create dzi file descriptor
    dzi_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<Image TileSize="{tile_size}" Overlap="{overlap}" Format="jpg" xmlns="http://schemas.microsoft.com/deepzoom/2008">
  <Size Width="{width}" Height="{height}"/>
</Image>'''
    
    with open(f'{basename}.dzi', 'w') as f:
        f.write(dzi_content)
        
    tiles_dir = f'{basename}_files'
    if not os.path.exists(tiles_dir):
        os.makedirs(tiles_dir)
        
    # Generate tiles from Native size backwards
    for level in range(num_levels - 1, -1, -1):
        level_dir = os.path.join(tiles_dir, str(level))
        if not os.path.exists(level_dir):
            os.makedirs(level_dir)
            
        scale = math.pow(0.5, num_levels - 1 - level)
        level_width = int(math.ceil(width * scale))
        level_height = int(math.ceil(height * scale))
        
        print(f'-> [Nivel {level}] Escala: {level_width}x{level_height} px.')
        
        if level_width == 0 or level_height == 0:
            continue
            
        if scale == 1.0:
            level_img = img
        else:
            level_img = img.resize((level_width, level_height), Image.Resampling.LANCZOS)
        
        cols = int(math.ceil(level_width / tile_size))
        rows = int(math.ceil(level_height / tile_size))
        
        for col in range(cols):
            for row in range(rows):
                # Calculate bounds without overlap for logic, then expand for overlap
                x1 = col * tile_size
                y1 = row * tile_size
                x2 = x1 + tile_size
                y2 = y1 + tile_size
                
                # Apply overlap
                x1 = max(0, x1 - overlap)
                y1 = max(0, y1 - overlap)
                x2 = min(level_width, x2 + overlap)
                y2 = min(level_height, y2 + overlap)
                
                # We need to crop accurately
                tile = level_img.crop((x1, y1, x2, y2))
                tile_path = os.path.join(level_dir, f'{col}_{row}.jpg')
                tile.save(tile_path, 'JPEG', quality=85)
                
    print(f'¡Pirámide DZI completada para {basename}!')

if __name__ == "__main__":
    import shutil
    import time
    
    start = time.time()
    build_dzi('16242000.jpg', 'romano')
    print(f'Tiempo total: {round(time.time() - start, 2)} segundos.')
