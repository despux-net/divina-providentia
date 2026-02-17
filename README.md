# Divina Providentia

> **Viste tu sabiduría** - Ropa inspirada en la filosofía estoica

Una tienda de ropa moderna y minimalista con temática mítico-religiosa, que presenta pasajes estoicos cuidadosamente seleccionados y funcionalidad completa de e-commerce.

## 🌟 Características

- **Diseño Minimalista Moderno**: Paleta de colores divinos (oro, púrpura sagrado, blanco etéreo)
- **Citas Estoicas Rotativas**: 8 pasajes filosóficos de Marco Aurelio, Séneca y Epicteto
- **Catálogo de Productos**: 14 productos con nombres latinos y descripciones filosóficas
- **Carrito de Compras**: Funcionalidad completa con persistencia en localStorage
- **Sistema de Checkout**: Formulario validado con integración a Supabase
- **Gestión de Imágenes**: Panel de administración para subir imágenes de productos
- **Diseño Responsivo**: Optimizado para todos los dispositivos
- **Animaciones Suaves**: Efectos de desplazamiento y hover elegantes
- **Deploy Automático**: GitHub Actions configurado para despliegue automático

## 🛍️ Categorías de Productos

- **Vestimentas Sagradas**: Camisetas, sudaderas, hoodies
- **Tocados Divinos**: Gorras, beanies
- **Accesorios Místicos**: Bolsas, pins, llaveros
- **Grabados Filosóficos**: Láminas artísticas, pósters

## 🚀 Despliegue Automático con GitHub Actions

El sitio se despliega automáticamente a GitHub Pages cada vez que haces push a la rama `main`.

### Configuración de GitHub Pages

1. Ve a Settings → Pages en tu repositorio de GitHub
2. En **Source**, selecciona `GitHub Actions`
3. ¡Listo! Tu sitio se actualizará automáticamente en cada push

### URL del Sitio

- **GitHub Pages**: `https://despux-net.github.io/divina-providentia/`
- **Dominio personalizado**: Configurado en archivo `CNAME`

## 🔧 Configuración

### Supabase

El sitio está conectado a Supabase para gestionar productos, pedidos e imágenes:

- **URL**: `https://nzwtafacdpdgulzcwntx.supabase.co`
- **Tabla de productos**: 14 productos con soporte para imágenes
- **Tabla de pedidos**: Sistema completo de checkout para invitados
- **Storage**: Bucket público `products` para imágenes de productos

### Archivos Principales

- `index.html` - Estructura HTML principal del sitio
- `admin.html` - Panel de administración para subir imágenes
- `styles.css` - Sistema de diseño completo
- `app.js` - Lógica de la aplicación
- `supabase-config.js` - Configuración y API de Supabase
- `.github/workflows/deploy.yml` - Workflow de GitHub Actions

## 📦 Sin Proceso de Compilación

Este sitio utiliza HTML, CSS y JavaScript puros. No requiere:
- ❌ Node.js
- ❌ npm install
- ❌ Build process
- ❌ Webpack/Vite

Simplemente abre `index.html` en tu navegador o súbelo a GitHub Pages.

## 🖼️ Gestión de Imágenes de Productos

### Usar el Panel de Administración

1. Abre `admin.html` en tu navegador
2. Verás todos los productos cargados desde Supabase
3. Para cada producto:
   - Click en "📷 Seleccionar Imagen"
   - Elige una imagen de tu computadora
   - Click en "Subir Imagen"
   - La imagen se subirá a Supabase Storage automáticamente

### Formato de Imágenes Recomendado

- **Formato**: JPG, PNG, o WebP
- **Tamaño**: Máximo 2MB por imagen
- **Dimensiones**: 800x800px (cuadrado) para mejor visualización
- **Calidad**: Alta resolución para zoom

## 🎨 Filosofía de Diseño

1. **Minimalismo**: Diseños limpios, mucho espacio en blanco
2. **Elegancia**: Tipografía sofisticada, animaciones sutiles
3. **Mitología**: Acentos dorados divinos, tonos púrpura sagrados

## 📱 Responsive

- Mobile: 1 columna
- Tablet: 2 columnas
- Desktop: 3-4 columnas
- Breakpoints: 640px, 768px, 1024px, 1280px

## 🔐 Seguridad

- Row Level Security (RLS) habilitado en Supabase
- Acceso público de solo lectura a productos
- Checkout para invitados (sin necesidad de registro)
- Validación de formularios en el frontend
- Claves públicas seguras (publishable keys)
- Storage público solo para imágenes de productos

## 🛠️ Funcionalidades Implementadas

### Frontend
- ✅ Carga de productos desde Supabase
- ✅ Filtrado por categorías
- ✅ Carrito de compras con localStorage
- ✅ Modal de carrito interactivo
- ✅ Sistema de checkout completo
- ✅ Animaciones y transiciones suaves
- ✅ Diseño responsive
- ✅ Citas estoicas rotativas

### Backend (Supabase)
- ✅ Base de datos PostgreSQL
- ✅ Tabla de productos con 14 items
- ✅ Tabla de pedidos con order_items
- ✅ Storage para imágenes de productos
- ✅ RLS policies configuradas
- ✅ API REST automática

### DevOps
- ✅ GitHub Actions para deploy automático
- ✅ Workflow configurado
- ✅ Deploy a GitHub Pages

## 📝 Cómo Actualizar el Sitio

1. Haz cambios en tus archivos locales
2. Commit los cambios:
   ```bash
   git add .
   git commit -m "Descripción de los cambios"
   ```
3. Push a GitHub:
   ```bash
   git push origin main
   ```
4. ¡El sitio se actualizará automáticamente en ~30 segundos!

## 🎯 Próximos Pasos Sugeridos

- [ ] Agregar sistema de autenticación de usuarios
- [ ] Implementar panel de administración completo
- [ ] Integrar pasarela de pagos (Stripe/PayPal)
- [ ] Agregar sistema de envío de emails
- [ ] Implementar búsqueda de productos
- [ ] Agregar reviews y ratings
- [ ] Crear blog de filosofía estoica

## 📝 Licencia

© 2026 Divina Providentia. Todos los derechos reservados.

---

**Diseñado con sabiduría estoica** 🏛️
