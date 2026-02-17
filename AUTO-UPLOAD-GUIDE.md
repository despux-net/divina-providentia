# 🚀 Auto-Upload System - Guía de Uso

## ¿Qué hace este sistema?

Este sistema automáticamente:
1. **Monitorea** la carpeta `product-images`
2. **Detecta** cuando agregas una nueva imagen
3. **Sube** la imagen a Supabase Storage
4. **Crea** un producto nuevo en la base de datos con la imagen vinculada
5. **Te notifica** cuando está listo para editar

## 📋 Instalación

### 1. Instalar Python (si no lo tienes)
Descarga Python desde: https://www.python.org/downloads/

### 2. Instalar dependencias
Abre PowerShell en la carpeta del proyecto y ejecuta:

```powershell
pip install -r requirements.txt
```

## 🎯 Cómo Usar

### Paso 1: Iniciar el sistema

Abre PowerShell en la carpeta del proyecto y ejecuta:

```powershell
python auto-upload.py
```

Verás algo como:
```
============================================================
🏛️  DIVINA PROVIDENTIA - Auto Upload System
============================================================

👀 Watching folder: C:\...\product-images
📝 Supported formats: .jpg, .jpeg, .png, .gif, .webp

✨ Ready! Drop images in the product-images folder to auto-upload
   Press Ctrl+C to stop
```

### Paso 2: Agregar imágenes

1. **Abre la carpeta** `product-images` en el Explorador de Windows
2. **Arrastra o copia** tus imágenes de productos a esta carpeta
3. **¡Listo!** El sistema automáticamente:
   - Subirá la imagen a Supabase
   - Creará un producto nuevo
   - Te mostrará el ID del producto

### Paso 3: Editar detalles del producto

Después de que se suba la imagen, verás un mensaje como:

```
📸 Processing: camiseta-virtus.jpg
   ⬆️  Uploading to Supabase Storage...
   ✅ Uploaded to: https://...
   📦 Creating product in database...
   ✅ Product created with ID: 15
   💡 Edit product details at:
      https://supabase.com/dashboard/project/nzwtafacdpdgulzcwntx/editor
   🎉 Success! Product 'Camiseta Virtus' ready for editing
```

Ahora ve a Supabase y edita:
- **Precio** (price)
- **Descripción** (description)
- **Categoría** (category): `vestments`, `headwear`, `accessories`, o `prints`
- **Tallas** (sizes): Array de tallas disponibles

## 📝 Nombres de Archivos

El sistema usa el nombre del archivo para generar el nombre del producto:

| Nombre de Archivo | Nombre de Producto |
|-------------------|-------------------|
| `camiseta-virtus.jpg` | Camiseta Virtus |
| `hoodie_memento_mori.png` | Hoodie Memento Mori |
| `gorra-stoic.jpg` | Gorra Stoic |

**Tip:** Usa nombres descriptivos con guiones (-) o guiones bajos (_)

## 🎨 Formatos Soportados

- ✅ `.jpg` / `.jpeg`
- ✅ `.png`
- ✅ `.gif`
- ✅ `.webp`

## 📊 Seguimiento

El sistema guarda un registro en `.processed-images.json` para no procesar la misma imagen dos veces.

Si quieres volver a procesar una imagen:
1. Elimina su entrada en `.processed-images.json`
2. Vuelve a copiar la imagen a la carpeta

## ⚠️ Notas Importantes

1. **No cierres la ventana de PowerShell** mientras quieras que el sistema funcione
2. **Las imágenes se procesan una sola vez** - no las borres de la carpeta después
3. **El producto se crea con valores por defecto**:
   - Precio: $0
   - Categoría: `vestments`
   - Descripción: "Producto pendiente de descripción"
4. **Debes editar estos valores en Supabase** después de la subida

## 🛑 Detener el Sistema

Presiona `Ctrl+C` en la ventana de PowerShell para detener el monitoreo.

## 🔧 Solución de Problemas

### Error: "No module named 'requests'"
```powershell
pip install requests watchdog
```

### Error: "Permission denied"
- Cierra cualquier programa que esté usando las imágenes
- Ejecuta PowerShell como administrador

### La imagen no se procesa
- Verifica que el formato sea soportado
- Revisa que el archivo no esté en `.processed-images.json`
- Asegúrate de que el script esté corriendo

## 📚 Flujo de Trabajo Recomendado

1. **Inicia el script** al comenzar tu día
2. **Agrega imágenes** a la carpeta según las vayas preparando
3. **Edita en Supabase** los detalles de cada producto
4. **Verifica en tu sitio** que todo se vea bien
5. **Detén el script** cuando termines

## 🎯 Ejemplo Completo

```powershell
# 1. Instalar dependencias (solo una vez)
pip install -r requirements.txt

# 2. Iniciar el sistema
python auto-upload.py

# 3. En otra ventana, agregar imágenes
# (Arrastra archivos a product-images/)

# 4. Ver el progreso en la consola
# 5. Editar productos en Supabase
# 6. Presionar Ctrl+C para detener
```

---

**¡Listo para automatizar tu flujo de trabajo!** 🚀
