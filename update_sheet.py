import sys
import importlib.util

# Load the auto-upload module dynamically
spec = importlib.util.spec_from_file_location("auto_upload", "auto-upload.py")
auto_upload = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auto_upload)

client = auto_upload.get_sheet_client()
if not client:
    print("No se pudo conectar a Google Sheets.")
    sys.exit(1)

sheet = client.open(auto_upload.SHEET_NAME).sheet1

# Find the row for jacketf.png
cell = sheet.find('jacketf.png')

if cell:
    row_num = cell.row
    # We need to set 'Disponible' and 'Publicar' to 'SI'
    # According to auto-upload: Nombre, Precio, Imagen, Descripcion, Talla, Categoria, Disponible, Publicar
    # Which corresponds to columns A through H depending on layout.
    
    headers = sheet.row_values(1)
    
    try:
        disponible_idx = headers.index('Disponible') + 1
        publicar_idx = headers.index('Publicar') + 1
        
        sheet.update_cell(row_num, disponible_idx, "SI")
        sheet.update_cell(row_num, publicar_idx, "SI")
        print(f"Hoja de cálculo actualizada en la fila {row_num}: Disponible=SI, Publicar=SI")
        
        # Now trigger sync
        print("Sincronizando de vuelta a Supabase...")
        auto_upload.sync_from_sheet(client)
        print("¡Sincronización de Supabase completada!")
        
    except ValueError as e:
        print(f"Error buscando las columnas: {e}")
        # Just update roughly if index fails
        sheet.update_cell(row_num, 7, "SI")
        sheet.update_cell(row_num, 8, "SI")
        auto_upload.sync_from_sheet(client)
        print("Columnas 7 y 8 actualizadas directamente.")
else:
    print("No se encontró jacketf.png en la hoja de cálculo.")
