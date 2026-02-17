# 📜 Guía de Gestión: Biblioteca Sagrada (Sistema Dinámico)

Ahora gestionar tu biblioteca es mucho más fácil. Ya **NO** necesitas tocar código ni archivos extraños.
Todo se hace desde tu panel de Supabase, como si fuera una hoja de Excel.

---

## ➕ Cómo Agregar un Nuevo Libro

### Paso 1: Sube el PDF a Google Drive
1. Sube tu archivo PDF a Google Drive.
2. Haz clic derecho -> **Compartir** -> **Compartir**.
3. En "Acceso general", selecciona: **"Cualquiera que tenga el vínculo"**.
4. Copia el enlace.
   - Ejemplo de enlace: `https://drive.google.com/file/d/1ABCDE-fghijkLMNOP/view?usp=sharing`
   - **IMPORTANTE:** El ID es la parte rara entre `/d/` y `/view`. En este ejemplo es: `1ABCDE-fghijkLMNOP`.

### Paso 2: Agregarlo a la Base de Datos
1. Entra a tu proyecto en **Supabase** (https://supabase.com/dashboard).
2. En el menú izquierdo, ve al ícono de **Table Editor** (parece una tabla).
3. Haz clic en la tabla **`books`**.
4. Haz clic en el botón verde **"Insert row"** (o "Add row").
5. Rellena los campos:
   - **title:** El título del libro.
   - **author:** El autor.
   - **description:** Una breve descripción.
   - **drive_file_id:** Pega AQUÍ el ID que copiaste en el Paso 1.
   - **cover_url:** (Opcional) El nombre de la imagen de portada (ej. `LOGOV4.png`).
6. Haz clic en **Save**.

¡Listo! El libro aparecerá automáticamente en tu página web.

---

## ✏️ Cómo Editar o Borrar Libros

1. Ve a la misma tabla **`books`** en Supabase.
2. Para **Editar**: Haz doble clic en cualquier celda y cambia el texto. Se guarda solo.
3. Para **Borrar**: Haz clic derecho en la fila -> **Delete row**.

---

## ⚠️ Notas Importantes
- No borres la tabla `books`.
- Si un libro no carga, verifica que el **ID de Drive** sea correcto y que el archivo en Drive sea **Público**.
