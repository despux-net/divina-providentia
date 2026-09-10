// ===================================================================
// DIVINA PROVIDENTIA — PANEL DE ADMINISTRACIÓN
//
// Este archivo no protege nada por sí solo: es una comodidad de la
// interfaz. Quien manda es la RLS de Postgres (supabase-admin-setup.sql).
// Aunque alguien se salte esta pantalla, la base de datos le negará
// cualquier escritura si su perfil no tiene is_admin.
// ===================================================================

const SINGLE_SIZE = 'ÚNICA';
const BUCKET = 'products';

const ORDER_STATUSES = {
    pending: 'Pendiente',
    processing: 'En proceso',
    shipped: 'Enviado',
    delivered: 'Entregado',
    cancelled: 'Cancelado'
};

const CATEGORY_NAMES = {
    vestments: 'Prendas',
    vestiment: 'Prendas',
    headwear: 'Gorras',
    accessories: 'Accesorios',
    prints: 'Impresiones'
};

const state = {
    products: [],
    orders: [],
    lookbook: [],
    heroImage: null,
    theme: {},
    themeSaved: {},
    footer: {},
    footerSaved: {},
    gallery: [],
    colors: [],
    orderFilter: 'all',
    openOrderId: null,
    editing: null,
    pendingImage: null
};

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Los pedidos anteriores a que existieran los apellidos guardan el nombre
// completo en customer_name, así que concatenar a ciegas duplicaría texto.
function fullName(order) {
    return [order.customer_name, order.customer_surname]
        .filter(Boolean).join(' ').trim() || 'Sin nombre';
}

function money(n) {
    return '$' + Number(n || 0).toFixed(2);
}

function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

let toastTimer;
function toast(message, isError) {
    const el = $('toast');
    el.textContent = message;
    el.classList.toggle('error', !!isError);
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}


// ===================================================================
// ACCESO
// ===================================================================

async function boot() {
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        showLogin();
        return;
    }

    const admin = await verifyAdmin(session.user.id);
    if (!admin) {
        await supabaseClient.auth.signOut();
        showLogin('Esta cuenta no tiene permisos de administración.');
        return;
    }

    showPanel(session.user.email);
}

// La consulta se hace contra 'profiles', que la RLS ya limita a la
// propia fila. Si devuelve is_admin, es porque la base lo confirma.
async function verifyAdmin(userId) {
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('is_admin')
        .eq('id', userId)
        .maybeSingle();

    if (error) {
        console.error('No se pudo comprobar el perfil:', error);
        return false;
    }
    return !!(data && data.is_admin);
}

function showLogin(message) {
    $('bootView').hidden = true;
    $('panelView').hidden = true;
    $('loginView').hidden = false;
    $('loginError').textContent = message || '';
}

function showPanel(email) {
    $('bootView').hidden = true;
    $('loginView').hidden = true;
    $('panelView').hidden = false;
    $('currentUser').textContent = email || '';

    loadStats();
    loadProducts();
    loadOrders();
    loadLookbook();
    loadHero();
    loadSettings();
    loadTheme();
    loadFooter();
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = $('loginBtn');
    const errorEl = $('loginError');

    btn.disabled = true;
    btn.textContent = 'Entrando…';
    errorEl.textContent = '';

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: $('loginEmail').value.trim(),
        password: $('loginPassword').value
    });

    if (error) {
        errorEl.textContent = 'Correo o contraseña incorrectos.';
        btn.disabled = false;
        btn.textContent = 'Entrar';
        return;
    }

    const admin = await verifyAdmin(data.user.id);
    if (!admin) {
        await supabaseClient.auth.signOut();
        errorEl.textContent = 'Esta cuenta no tiene permisos de administración.';
        btn.disabled = false;
        btn.textContent = 'Entrar';
        return;
    }

    btn.disabled = false;
    btn.textContent = 'Entrar';
    $('loginForm').reset();
    showPanel(data.user.email);
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    location.reload();
}


// ===================================================================
// RESUMEN
// ===================================================================

async function loadStats() {
    const grid = $('statsGrid');
    const { data, error } = await supabaseClient.rpc('admin_stats');

    if (error || !data) {
        grid.innerHTML = '<div class="loading">No se pudo cargar el resumen</div>';
        return;
    }

    const cards = [
        ['Ingresos totales', money(data.revenue)],
        ['Últimos 30 días', money(data.revenue_30d)],
        ['Pedidos', data.orders_total ?? 0],
        ['Pendientes', data.orders_pending ?? 0],
        ['Productos', `${data.published ?? 0}/${data.products ?? 0}`],
        ['Mensajes sin leer', data.unread_msgs ?? 0]
    ];

    grid.innerHTML = cards.map(([label, value]) => `
        <div class="stat">
            <div class="stat-label">${escapeHtml(label)}</div>
            <div class="stat-value">${escapeHtml(value)}</div>
        </div>`).join('');
}


// ===================================================================
// PRODUCTOS
// ===================================================================

function imageUrl(filename) {
    if (!filename) return null;
    if (/^https?:\/\//i.test(filename)) return filename;
    return `${window.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filename}`;
}

function sizesOf(product) {
    return Array.isArray(product.sizes) ? product.sizes.filter(Boolean) : [];
}

// Claves de stock de un producto: sus tallas, o la talla única si no
// se vende por tallas.
function stockKeys(product) {
    const sizes = sizesOf(product);
    if (sizes.length) return sizes;
    const stored = Object.keys(product.stock_by_size || {});
    return stored.length ? stored : [SINGLE_SIZE];
}

// Unidades totales. Es lo que decide si la tienda deja comprar, así que
// el panel tiene que enseñarlo igual que lo aplica la web.
function totalStock(product) {
    const stock = product.stock_by_size || {};
    return stockKeys(product)
        .reduce((sum, size) => sum + (parseInt(stock[size], 10) || 0), 0);
}

async function loadProducts() {
    const list = $('productsList');

    // Sin filtro de 'published': el admin ve también los borradores.
    const { data, error } = await supabaseClient
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        list.innerHTML = '<div class="loading">No se pudieron cargar los productos</div>';
        console.error(error);
        return;
    }

    state.products = data || [];
    renderProducts();
}

// Detecta fichas sin terminar. Un producto publicado con la descripción
// de relleno se ve como descuido en la tienda, y desde la lista no había
// forma de saber cuáles faltaban por escribir.
const PLACEHOLDER_HINTS = ['pendiente', 'lorem', 'placeholder', 'todo', 'xxx', 'prueba', 'test', 'sin descripcion'];

function copyIssue(product) {
    const d = (product.description || '').trim();
    if (!d) return 'Sin descripción';
    const low = d.toLowerCase();
    if (PLACEHOLDER_HINTS.some(k => low.includes(k))) return 'Texto provisional';
    if (d.length < 60) return 'Descripción muy corta';
    return null;
}

function renderProducts() {
    const list = $('productsList');

    if (!state.products.length) {
        list.innerHTML = '<div class="loading">Todavía no hay productos</div>';
        return;
    }

    list.innerHTML = state.products.map(product => {
        const cover = galleryOf(product)[0];
        const url = imageUrl(cover);
        const issue = copyIssue(product);
        const photos = galleryOf(product).length;
        const stock = product.stock_by_size || {};
        const pills = stockKeys(product).map(size => {
            const n = parseInt(stock[size], 10) || 0;
            const label = size === SINGLE_SIZE ? '' : size + ' ';
            return `<span class="stock-pill${n === 0 ? ' zero' : ''}">${escapeHtml(label)}${n}</span>`;
        }).join('');

        // Estado efectivo, que es el que ve el cliente. Marcar "a la venta"
        // no basta: si no hay unidades, la tienda lo sigue dando por
        // agotado, y eso desde el panel era invisible.
        const units = totalStock(product);
        let saleFlag, saleClass;
        if (!product.available) {
            saleFlag = 'Agotado'; saleClass = 'off';
        } else if (units === 0) {
            saleFlag = 'Sin stock'; saleClass = 'warn';
        } else {
            saleFlag = 'A la venta'; saleClass = 'on';
        }

        return `
        <div class="prod-row" data-id="${product.id}">
            <div class="prod-thumb">
                ${url ? `<img src="${escapeHtml(url)}" alt="" loading="lazy">` : ''}
            </div>
            <div class="prod-main">
                <div class="prod-name">${escapeHtml(product.name)}</div>
                <div class="prod-meta">${escapeHtml(CATEGORY_NAMES[product.category] || product.category || '')}${photos > 1 ? ` · ${photos} fotos` : ''}</div>
                <div class="prod-stock">${pills}</div>
                ${issue ? `<div class="copy-warn">${escapeHtml(issue)}</div>` : ''}
            </div>
            <div class="prod-price">${money(product.price)}</div>
            <div class="prod-flags">
                <span class="flag ${product.published ? 'on' : 'off'}">${product.published ? 'Publicado' : 'Borrador'}</span>
                <span class="flag ${saleClass}">${saleFlag}</span>
            </div>
            <button class="lb-btn danger prod-delete" data-delete="${product.id}"
                    title="Eliminar producto" aria-label="Eliminar ${escapeHtml(product.name)}">&times;</button>
        </div>`;
    }).join('');

    list.querySelectorAll('.prod-row').forEach(row => {
        row.addEventListener('click', () => {
            const product = state.products.find(p => String(p.id) === row.dataset.id);
            if (product) openProductForm(product);
        });
    });

    // La papelera va dentro de la fila, que abre la ficha al pulsarla: sin
    // stopPropagation, borrar abriría además el formulario del producto.
    list.querySelectorAll('[data-delete]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const product = state.products.find(p => String(p.id) === btn.dataset.delete);
            if (product) deleteProduct(product.id, product.name, false);
        });
    });
}

// ===================================================================
// GALERÍA DEL PRODUCTO
//
// state.gallery guarda los nombres de archivo dentro del bucket, en el
// orden en que se mostrarán. La primera es la portada.
// ===================================================================

function galleryOf(product) {
    if (!product) return [];
    const g = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
    if (g.length) return g.slice();
    return product.image ? [product.image] : [];
}

function renderGallery() {
    const wrap = $('pGallery');

    if (!state.gallery.length) {
        wrap.innerHTML = '<p class="gallery-empty">Sin fotos todavía</p>';
        return;
    }

    wrap.innerHTML = state.gallery.map((file, i) => `
        <div class="gphoto">
            <div class="gphoto-img">
                <img src="${escapeHtml(imageUrl(file))}" alt="">
                ${i === 0 ? '<span class="gphoto-badge">Portada</span>' : ''}
            </div>
            <div class="gphoto-bar">
                <button type="button" data-gmove="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Mover antes">&larr;</button>
                <button type="button" data-gmove="down" data-i="${i}" ${i === state.gallery.length - 1 ? 'disabled' : ''} title="Mover después">&rarr;</button>
                <button type="button" class="danger" data-gdel="${i}" title="Quitar">&times;</button>
            </div>
        </div>`).join('');

    wrap.querySelectorAll('[data-gmove]').forEach(btn => {
        btn.addEventListener('click', () => {
            const i = Number(btn.dataset.i);
            const j = btn.dataset.gmove === 'up' ? i - 1 : i + 1;
            if (j < 0 || j >= state.gallery.length) return;
            const g = state.gallery;
            [g[i], g[j]] = [g[j], g[i]];
            renderGallery();
        });
    });

    wrap.querySelectorAll('[data-gdel]').forEach(btn => {
        btn.addEventListener('click', () => {
            // Solo se quita de la lista. El archivo sigue en el bucket
            // por si otro producto o un pedido antiguo lo usa.
            state.gallery.splice(Number(btn.dataset.gdel), 1);
            renderGallery();
        });
    });
}

async function addGalleryFiles(files) {
    const btn = $('pImageBtn');
    const name = $('pImageName');
    btn.disabled = true;

    let done = 0;
    try {
        for (const file of files) {
            btn.textContent = `Subiendo ${done + 1}/${files.length}…`;
            state.gallery.push(await uploadImage(file));
            done++;
        }
        name.textContent = done === 1 ? '1 foto añadida' : `${done} fotos añadidas`;
    } catch (err) {
        console.error(err);
        $('productError').textContent = 'No se pudo subir alguna foto: ' + (err.message || '');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Añadir fotos…';
        $('pImageFile').value = '';
        renderGallery();
    }
}


// ===================================================================
// COLORES
// ===================================================================

function renderColors() {
    const wrap = $('pColors');

    wrap.innerHTML = state.colors.map((c, i) => `
        <div class="color-row">
            <input type="color" data-chex="${i}" value="${escapeHtml(c.hex || '#000000')}"
                   aria-label="Color ${i + 1}">
            <input type="text" data-cname="${i}" value="${escapeHtml(c.name || '')}"
                   placeholder="Nombre del color (Negro, Crudo…)" maxlength="40">
            <button type="button" class="lb-btn danger" data-cdel="${i}" title="Quitar">&times;</button>
        </div>`).join('');

    wrap.querySelectorAll('[data-cname]').forEach(input => {
        input.addEventListener('input', () => {
            state.colors[Number(input.dataset.cname)].name = input.value;
        });
    });
    wrap.querySelectorAll('[data-chex]').forEach(input => {
        input.addEventListener('input', () => {
            state.colors[Number(input.dataset.chex)].hex = input.value;
        });
    });
    wrap.querySelectorAll('[data-cdel]').forEach(btn => {
        btn.addEventListener('click', () => {
            state.colors.splice(Number(btn.dataset.cdel), 1);
            renderColors();
        });
    });
}


function renderStockFields(sizes, current) {
    const keys = sizes.length ? sizes : [SINGLE_SIZE];
    $('stockFields').innerHTML = keys.map(size => `
        <label class="stock-field">
            <span>${escapeHtml(size === SINGLE_SIZE ? 'Unidades' : size)}</span>
            <input type="number" min="0" step="1"
                   data-size="${escapeHtml(size)}"
                   value="${parseInt((current || {})[size], 10) || 0}">
        </label>`).join('');
}

function openProductForm(product) {
    state.editing = product || null;
    state.pendingImage = null;

    $('productModalTitle').textContent = product ? 'Editar producto' : 'Nuevo producto';
    $('pId').value = product ? product.id : '';
    $('pName').value = product ? product.name || '' : '';
    $('pPrice').value = product ? product.price ?? '' : '';
    $('pDescription').value = product ? product.description || '' : '';
    $('pCategory').value = product ? (product.category || 'vestments') : 'vestments';
    $('pSizes').value = product ? sizesOf(product).join(', ') : '';
    $('pPublished').checked = product ? !!product.published : false;
    $('pAvailable').checked = product ? !!product.available : true;
    $('pMaterial').value = product ? product.material || '' : '';
    $('pCare').value = product ? product.care || '' : '';
    $('productError').textContent = '';
    $('pImageName').textContent = '';
    $('pImageFile').value = '';

    state.gallery = galleryOf(product);
    state.colors = product && Array.isArray(product.colors)
        ? product.colors.map(c => ({ name: c.name || '', hex: c.hex || '#000000' }))
        : [];
    renderGallery();
    renderColors();

    renderStockFields(
        product ? sizesOf(product) : [],
        product ? product.stock_by_size : {}
    );

    $('deleteProductBtn').hidden = !product;
    refreshStockWarning();

    $('productOverlay').hidden = false;
    $('productModal').hidden = false;
    document.body.style.overflow = 'hidden';
}

function closeProductForm() {
    $('productOverlay').hidden = true;
    $('productModal').hidden = true;
    document.body.style.overflow = '';
    state.editing = null;
    state.pendingImage = null;
}

// Al cambiar las tallas se regeneran los campos de stock, conservando
// las cifras de las tallas que siguen existiendo.
function onSizesChanged() {
    const sizes = $('pSizes').value.split(',').map(s => s.trim()).filter(Boolean);
    const current = {};
    $('stockFields').querySelectorAll('input[data-size]').forEach(input => {
        current[input.dataset.size] = parseInt(input.value, 10) || 0;
    });
    renderStockFields(sizes, current);
    refreshStockWarning();
}

// Avisa en vivo del caso que más despista: interruptor puesto y cero
// unidades, que en la tienda se sigue viendo como agotado.
function refreshStockWarning() {
    const el = $('stockWarning');
    if (!el) return;

    const units = Object.values(collectStock()).reduce((a, b) => a + b, 0);
    el.textContent = ($('pAvailable').checked && units === 0)
        ? 'Está marcado «A la venta» pero no hay unidades: en la tienda seguirá saliendo AGOTADO hasta que pongas cantidades.'
        : '';
}

function collectStock() {
    const stock = {};
    $('stockFields').querySelectorAll('input[data-size]').forEach(input => {
        stock[input.dataset.size] = Math.max(0, parseInt(input.value, 10) || 0);
    });
    return stock;
}

async function uploadImage(file) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabaseClient.storage
        .from(BUCKET)
        .upload(filename, file, { cacheControl: '3600', upsert: false });

    if (error) throw error;
    return filename;
}

async function saveProduct(e) {
    e.preventDefault();

    const btn = $('saveProductBtn');
    const errorEl = $('productError');
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    errorEl.textContent = '';

    try {
        const sizes = $('pSizes').value.split(',').map(s => s.trim()).filter(Boolean);

        const payload = {
            name: $('pName').value.trim(),
            description: $('pDescription').value.trim() || null,
            price: Number($('pPrice').value),
            category: $('pCategory').value,
            sizes,
            stock_by_size: collectStock(),
            images: state.gallery.slice(),
            // 'image' se mantiene sincronizada con la primera foto: es la
            // que usan la web y el panel cuando un producto todavía no
            // tiene galería.
            image: state.gallery[0] || null,
            colors: state.colors
                .filter(c => c.name && c.name.trim())
                .map(c => ({ name: c.name.trim(), hex: c.hex || '#000000' })),
            material: $('pMaterial').value.trim() || null,
            care: $('pCare').value.trim() || null,
            published: $('pPublished').checked,
            available: $('pAvailable').checked
        };

        if (!payload.name) throw new Error('El nombre es obligatorio.');
        if (!(payload.price >= 0)) throw new Error('El precio no es válido.');
        if (payload.published && !payload.images.length) {
            throw new Error('Un producto publicado necesita al menos una foto.');
        }

        const id = $('pId').value;
        // El .select() no es decorativo: sin él, una escritura que la RLS
        // filtre devuelve error null y el panel cantaría "guardado" sin
        // haber guardado nada. Con él comprobamos que volvió la fila.
        const query = id
            ? supabaseClient.from('products').update(payload).eq('id', id).select()
            : supabaseClient.from('products').insert([payload]).select();

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) {
            throw new Error('La base de datos rechazó el cambio. Cierra sesión, vuelve a entrar e inténtalo otra vez.');
        }

        closeProductForm();
        toast(id ? 'Producto actualizado' : 'Producto creado');
        loadProducts();
        loadStats();
    } catch (err) {
        console.error(err);
        errorEl.textContent = err.message || 'No se pudo guardar.';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar';
    }
}

// Se llama desde la papelera de la lista y desde el botón de la ficha.
// 'fromForm' solo decide dónde se enseña el error.
async function deleteProduct(id, name, fromForm) {
    if (!id) return;

    if (!confirm(`¿Eliminar "${name}"?\n\nSe borra el producto y su ficha. Los pedidos ya hechos conservan lo que se vendió.\n\nEsta acción no se puede deshacer.`)) return;

    // El .select() distingue "no se pudo" de "no había nada que borrar":
    // sin él, una fila filtrada por la RLS devuelve error null y parecería
    // que se ha borrado.
    const { data, error } = await supabaseClient
        .from('products').delete().eq('id', id).select();

    if (error || !data || data.length === 0) {
        // El caso típico: order_items todavía apunta a este producto y la
        // clave ajena lo impide. Borrarlo rompería el histórico de ventas.
        const msg = error && error.code === '23503'
            ? 'No se puede eliminar: el producto aparece en pedidos ya realizados. Desmárcalo como «Publicado» para retirarlo de la tienda sin perder el histórico.'
            : 'No se pudo eliminar el producto.';

        if (fromForm) $('productError').textContent = msg;
        else toast(msg, true);
        console.error(error);
        return;
    }

    if (fromForm) closeProductForm();
    toast('Producto eliminado');
    loadProducts();
    loadStats();
}


// ===================================================================
// LOOKBOOK
//
// A diferencia de los productos, aquí la tabla guarda la URL pública
// entera, no el nombre del archivo. Se respeta ese formato para no
// romper las filas que ya existen.
// ===================================================================

const LOOKBOOK_BUCKET = 'lookbook';

async function loadLookbook() {
    const grid = $('lookbookGrid');

    const { data, error } = await supabaseClient
        .from('lookbook_images')
        .select('*')
        .order('display_order', { ascending: true });

    if (error) {
        grid.innerHTML = '<div class="loading">No se pudo cargar el lookbook</div>';
        console.error(error);
        return;
    }

    state.lookbook = data || [];
    renderLookbook();
}

function renderLookbook() {
    const grid = $('lookbookGrid');

    if (!state.lookbook.length) {
        grid.innerHTML = '<div class="loading">Todavía no hay imágenes</div>';
        return;
    }

    grid.className = 'lb-grid';
    grid.innerHTML = state.lookbook.map((img, i) => `
        <div class="lb-card">
            <div class="lb-thumb">
                <img src="${escapeHtml(img.image_url)}" alt="" loading="lazy">
            </div>
            <div class="lb-bar">
                <span class="lb-pos">${i + 1}</span>
                <button class="lb-btn" data-move="up" data-id="${img.id}"
                        ${i === 0 ? 'disabled' : ''} title="Mover antes">&uarr;</button>
                <button class="lb-btn" data-move="down" data-id="${img.id}"
                        ${i === state.lookbook.length - 1 ? 'disabled' : ''} title="Mover después">&darr;</button>
                <button class="lb-btn danger" data-remove="${img.id}" title="Eliminar">&times;</button>
            </div>
        </div>`).join('');

    grid.querySelectorAll('[data-move]').forEach(btn => {
        btn.addEventListener('click', () => moveLookbook(btn.dataset.id, btn.dataset.move));
    });
    grid.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', () => removeLookbook(btn.dataset.remove));
    });
}

async function addLookbookImages(files) {
    const btn = $('addLookbookBtn');
    btn.disabled = true;

    // Se sigue numerando a partir del último, para que las nuevas caigan
    // al final en lugar de colarse delante.
    let next = state.lookbook.length
        ? Math.max(...state.lookbook.map(i => i.display_order || 0)) + 1
        : 0;

    let ok = 0;
    try {
        for (const file of files) {
            btn.textContent = `Subiendo ${ok + 1}/${files.length}…`;

            const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
            const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

            const { error: upErr } = await supabaseClient.storage
                .from(LOOKBOOK_BUCKET)
                .upload(filename, file, { cacheControl: '3600', upsert: false });
            if (upErr) throw upErr;

            const publicUrl =
                `${window.SUPABASE_URL}/storage/v1/object/public/${LOOKBOOK_BUCKET}/${filename}`;

            const { data, error } = await supabaseClient
                .from('lookbook_images')
                .insert([{ image_url: publicUrl, display_order: next++ }])
                .select();

            if (error) throw error;
            if (!data || !data.length) {
                throw new Error('La base de datos rechazó la inserción.');
            }
            ok++;
        }

        toast(ok === 1 ? 'Imagen añadida' : `${ok} imágenes añadidas`);
    } catch (err) {
        console.error(err);
        toast(err.message || 'No se pudo subir', true);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Añadir imágenes';
        $('lookbookFile').value = '';
        loadLookbook();
    }
}

async function moveLookbook(id, direction) {
    const i = state.lookbook.findIndex(x => String(x.id) === String(id));
    const j = direction === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= state.lookbook.length) return;

    const a = state.lookbook[i];
    const b = state.lookbook[j];

    // Se intercambian las posiciones. Se usan los índices y no los
    // display_order guardados porque pueden venir repetidos o con huecos.
    const { error } = await supabaseClient.from('lookbook_images')
        .upsert([{ id: a.id, display_order: j }, { id: b.id, display_order: i }]);

    if (error) {
        toast('No se pudo reordenar', true);
        console.error(error);
        return;
    }

    state.lookbook[i] = b;
    state.lookbook[j] = a;
    renderLookbook();
}

async function removeLookbook(id) {
    if (!confirm('¿Eliminar esta imagen del lookbook?')) return;

    const img = state.lookbook.find(x => String(x.id) === String(id));

    const { error } = await supabaseClient
        .from('lookbook_images').delete().eq('id', id);

    if (error) {
        toast('No se pudo eliminar', true);
        console.error(error);
        return;
    }

    // Se borra también el archivo, pero solo si vive en nuestro bucket:
    // algunas filas antiguas apuntan al bucket de productos y no
    // conviene dejar sin foto a un producto por limpiar el lookbook.
    if (img && img.image_url.includes(`/public/${LOOKBOOK_BUCKET}/`)) {
        const filename = img.image_url.split('/').pop();
        await supabaseClient.storage.from(LOOKBOOK_BUCKET).remove([filename]);
    }

    toast('Imagen eliminada');
    loadLookbook();
}


// ===================================================================
// PORTADA
// ===================================================================

async function loadHero() {
    const { data, error } = await supabaseClient
        .from('site_settings')
        .select('hero_image')
        .eq('id', 1)
        .maybeSingle();

    if (error) {
        $('heroStatus').textContent =
            'No se pudo leer la configuración. ¿Has ejecutado la última versión del SQL?';
        console.error(error);
        return;
    }

    state.heroImage = data ? data.hero_image : null;
    renderHero();
}

function renderHero() {
    const preview = $('heroPreview');

    if (state.heroImage) {
        preview.innerHTML =
            `<img src="${escapeHtml(state.heroImage)}" alt="">
             <div class="hero-preview-label">DIVINA<br>PROVIDENTIA</div>`;
        $('heroRemoveBtn').hidden = false;
    } else {
        preview.innerHTML = '<div class="hero-preview-empty">Sin imagen</div>';
        $('heroRemoveBtn').hidden = true;
    }
}

async function saveHero(url) {
    const { data, error } = await supabaseClient
        .from('site_settings')
        .update({ hero_image: url })
        .eq('id', 1)
        .select();

    if (error) throw error;
    if (!data || !data.length) {
        throw new Error('La base de datos rechazó el cambio. Ejecuta la última versión del SQL y vuelve a intentarlo.');
    }

    state.heroImage = url;
    renderHero();
}

async function uploadHero(file) {
    const btn = $('heroUploadBtn');
    btn.disabled = true;
    btn.textContent = 'Subiendo…';
    $('heroStatus').textContent = '';

    try {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const filename = `hero-${Date.now()}.${ext}`;

        const { error: upErr } = await supabaseClient.storage
            .from(LOOKBOOK_BUCKET)
            .upload(filename, file, { cacheControl: '3600', upsert: false });
        if (upErr) throw upErr;

        await saveHero(
            `${window.SUPABASE_URL}/storage/v1/object/public/${LOOKBOOK_BUCKET}/${filename}`
        );
        toast('Portada actualizada');
    } catch (err) {
        console.error(err);
        $('heroStatus').textContent = err.message || 'No se pudo subir la imagen.';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Subir imagen…';
        $('heroFile').value = '';
    }
}

async function removeHero() {
    if (!confirm('¿Quitar la imagen de portada? El fondo volverá a ser blanco.')) return;

    try {
        await saveHero(null);
        toast('Portada sin imagen');
    } catch (err) {
        console.error(err);
        $('heroStatus').textContent = err.message || 'No se pudo quitar la imagen.';
    }
}


// ===================================================================
// PIE DE PÁGINA
//
// El borrador se lee del formulario cada vez que se escribe, y solo se
// normaliza al guardar: si se limpiara a cada tecla, una fila de enlace
// a medio escribir desaparecería bajo los dedos.
// ===================================================================

const NEWLINE = String.fromCharCode(10);

function readFooterForm() {
    const draft = {};

    document.querySelectorAll('[data-footer-field]').forEach(input => {
        const key = input.dataset.footerField;
        draft[key] = key === 'contactLines'
            ? input.value.split(NEWLINE).map(l => l.trim()).filter(Boolean)
            : input.value;
    });

    draft.social = Array.from(document.querySelectorAll('#socialRows .repeater-row'))
        .map(row => ({
            label: row.querySelector('.social-label').value,
            url: row.querySelector('.social-url').value
        }));

    return draft;
}

function footerIsDirty() {
    // Se comparan las versiones limpias: unos espacios de más al final
    // no son un cambio que merezca avisar de que hay algo sin guardar.
    return JSON.stringify(DPFooter.normalize(state.footer)) !== JSON.stringify(state.footerSaved);
}

function markFooterDirty() {
    $('footerDirty').hidden = !footerIsDirty();
}

function addSocialRow(item) {
    const row = document.createElement('div');
    row.className = 'repeater-row';
    row.innerHTML = `
        <input type="text" class="social-label" placeholder="Nombre" maxlength="40">
        <input type="url" class="social-url" placeholder="https://…" maxlength="300">
        <button type="button" class="btn btn-ghost repeater-remove" aria-label="Quitar enlace">&times;</button>`;
    row.querySelector('.social-label').value = (item && item.label) || '';
    row.querySelector('.social-url').value = (item && item.url) || '';
    $('socialRows').appendChild(row);
}

// Vuelca el borrador en el formulario. Solo se llama al cargar, al
// restablecer y al añadir o quitar filas.
function renderFooterEditor() {
    const f = DPFooter.normalize(state.footer);

    document.querySelectorAll('[data-footer-field]').forEach(input => {
        const key = input.dataset.footerField;
        input.value = key === 'contactLines' ? f.contactLines.join(NEWLINE) : f[key];
    });

    $('socialRows').innerHTML = '';
    f.social.forEach(addSocialRow);

    markFooterDirty();
}

async function loadFooter() {
    const { data, error } = await supabaseClient
        .from('site_settings')
        .select('footer')
        .eq('id', 1)
        .maybeSingle();

    if (error) {
        $('footerError').textContent =
            'No se pudo leer el pie. ¿Has ejecutado la última versión del SQL?';
        $('footerSaveBtn').disabled = true;
        console.error(error);
        return;
    }

    $('footerSaveBtn').disabled = false;
    state.footerSaved = DPFooter.normalize((data && data.footer) || {});
    state.footer = Object.assign({}, state.footerSaved);
    renderFooterEditor();
}

async function saveFooter() {
    const btn = $('footerSaveBtn');
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    $('footerError').textContent = '';

    const clean = DPFooter.normalize(readFooterForm());

    const { data, error } = await supabaseClient
        .from('site_settings')
        .update({ footer: clean })
        .eq('id', 1)
        .select();

    btn.disabled = false;
    btn.textContent = 'Guardar';

    if (error || !data || data.length === 0) {
        $('footerError').textContent = 'No se pudo guardar el pie.';
        console.error(error);
        return;
    }

    state.footer = clean;
    state.footerSaved = clean;

    // Se repinta con lo que ha quedado guardado de verdad: así se ve al
    // momento si un enlace se ha caído por no llevar https://.
    renderFooterEditor();
    toast('Pie de página guardado');
}

function resetFooter() {
    if (!confirm('¿Volver a los textos originales del pie? Se pierden los cambios que no hayas guardado.')) return;
    state.footer = JSON.parse(JSON.stringify(DPFooter.DEFAULTS));
    renderFooterEditor();
    toast('Textos originales cargados. Pulsa Guardar para aplicarlos.');
}


// ===================================================================
// APARIENCIA
//
// El borrador vive en state.theme. Se pinta en el marco de vista previa
// a cada cambio y solo llega a la base cuando se pulsa Guardar, para
// poder trastear sin que lo vean los clientes.
// ===================================================================

function themeIsDirty() {
    return JSON.stringify(state.theme) !== JSON.stringify(state.themeSaved);
}

function markThemeDirty() {
    $('themeDirty').hidden = !themeIsDirty();
}

function fillFontSelects() {
    const options = Object.entries(DPTheme.FONTS)
        .map(([key, f]) => `<option value="${escapeHtml(key)}">${escapeHtml(f.label)}</option>`)
        .join('');
    $('fontHead').innerHTML = options;
    $('fontBody').innerHTML = options;
}

// Vuelca el borrador en los controles y en la vista previa.
function renderTheme() {
    const t = DPTheme.normalize(state.theme);
    state.theme = t;

    document.querySelectorAll('[data-theme]').forEach(input => {
        const key = input.dataset.theme;
        if (key === 'colNavText') return;   // tiene su propio apartado, abajo
        if (input.value !== String(t[key])) input.value = t[key];
    });

    // El color de la cabecera vacío significa «el mismo que el texto
    // general»: manda el interruptor y el selector solo enseña, apagado,
    // el color que se está usando de verdad.
    const navTextAuto = !t.colNavText;
    $('navTextAuto').checked = navTextAuto;
    $('colNavText').disabled = navTextAuto;
    $('colNavText').value = t.colNavText || t.colText;

    document.querySelectorAll('[data-out]').forEach(out => {
        const v = t[out.dataset.out];
        out.textContent = typeof v === 'number' ? String(Math.round(v * 100) / 100) : v;
    });

    $('heroAlignSeg').querySelectorAll('button').forEach(b => {
        b.classList.toggle('is-active', b.dataset.align === t.heroAlign);
    });

    applyThemeToPreview();
    markThemeDirty();
}

function applyThemeToPreview() {
    const frame = $('themePreview');
    const doc = frame && frame.contentDocument;
    // Antes de que el marco cargue no hay nada que pintar; al terminar
    // de cargar se vuelve a llamar desde el evento 'load'.
    if (!doc || !doc.documentElement) return;
    try {
        DPTheme.apply(state.theme, doc);
    } catch (e) {
        console.warn('No se pudo pintar la vista previa:', e);
    }
}

async function loadTheme() {
    fillFontSelects();

    const { data, error } = await supabaseClient
        .from('site_settings')
        .select('theme')
        .eq('id', 1)
        .maybeSingle();

    if (error) {
        $('themeError').textContent =
            'No se pudo leer la apariencia. ¿Has ejecutado la última versión del SQL?';
        $('themeSaveBtn').disabled = true;
        console.error(error);
        return;
    }

    $('themeSaveBtn').disabled = false;
    state.themeSaved = DPTheme.normalize((data && data.theme) || {});
    state.theme = Object.assign({}, state.themeSaved);
    renderTheme();
}

async function saveTheme() {
    const btn = $('themeSaveBtn');
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    $('themeError').textContent = '';

    const { data, error } = await supabaseClient
        .from('site_settings')
        .update({ theme: state.theme })
        .eq('id', 1)
        .select();

    btn.disabled = false;
    btn.textContent = 'Guardar';

    if (error || !data || data.length === 0) {
        $('themeError').textContent = 'No se pudo guardar la apariencia.';
        console.error(error);
        return;
    }

    state.themeSaved = Object.assign({}, state.theme);
    markThemeDirty();
    toast('Apariencia guardada');
}

function resetTheme() {
    if (!confirm('¿Volver a la apariencia original? Se pierden los cambios que no hayas guardado.')) return;
    state.theme = Object.assign({}, DPTheme.DEFAULTS);
    renderTheme();
    toast('Valores de fábrica cargados. Pulsa Guardar para aplicarlos.');
}


// ===================================================================
// AJUSTES DE LA TIENDA
// ===================================================================

async function loadSettings() {
    const { data, error } = await supabaseClient
        .from('site_settings')
        .select('require_account')
        .eq('id', 1)
        .maybeSingle();

    if (error) {
        $('settingsError').textContent =
            'No se pudo leer la configuración. ¿Has ejecutado la última versión del SQL?';
        $('requireAccount').disabled = true;
        console.error(error);
        return;
    }

    $('requireAccount').disabled = false;
    $('requireAccount').checked = !!(data && data.require_account);
    renderSettingHint();
}

function renderSettingHint() {
    $('requireAccountHint').textContent = $('requireAccount').checked
        ? 'Encendido: para terminar la compra hay que iniciar sesión. A quien no tenga cuenta se le pedirá que se registre.'
        : 'Apagado: cualquiera puede comprar sin registrarse. Solo se le piden nombre, apellidos, correo y teléfono.';
}

async function saveRequireAccount() {
    const input = $('requireAccount');
    const value = input.checked;

    input.disabled = true;
    $('settingsError').textContent = '';
    renderSettingHint();

    const { data, error } = await supabaseClient
        .from('site_settings')
        .update({ require_account: value })
        .eq('id', 1)
        .select();

    input.disabled = false;

    if (error || !data || data.length === 0) {
        // Se deja el interruptor como estaba de verdad, para que no
        // parezca guardado algo que no lo está.
        input.checked = !value;
        renderSettingHint();
        $('settingsError').textContent =
            'No se pudo guardar el cambio. Vuelve a intentarlo.';
        console.error(error);
        return;
    }

    toast(value ? 'Ahora hace falta cuenta para comprar' : 'Ya se puede comprar sin cuenta');
}


// ===================================================================
// PEDIDOS
// ===================================================================

async function loadOrders() {
    const list = $('ordersList');

    const { data, error } = await supabaseClient
        .from('orders')
        .select('*, order_items(*)')
        .order('created_at', { ascending: false });

    if (error) {
        list.innerHTML = '<div class="loading">No se pudieron cargar los pedidos</div>';
        console.error(error);
        return;
    }

    state.orders = data || [];
    renderOrders();
}

function renderOrders() {
    const list = $('ordersList');

    const orders = state.orderFilter === 'all'
        ? state.orders
        : state.orders.filter(o => o.status === state.orderFilter);

    if (!orders.length) {
        list.innerHTML = '<div class="loading">No hay pedidos en este estado</div>';
        return;
    }

    list.innerHTML = orders.map(order => {
        const open = state.openOrderId === order.id;
        const items = order.order_items || [];

        const lines = items.map(item => `
            <div class="order-line">
                <span>${escapeHtml(item.product_name || 'Artículo')}${item.size && item.size !== SINGLE_SIZE ? ' · ' + escapeHtml(item.size) : ''} ×${item.quantity}</span>
                <span>${money((item.price_at_purchase || 0) * (item.quantity || 0))}</span>
            </div>`).join('');

        const buttons = Object.entries(ORDER_STATUSES).map(([value, label]) =>
            `<button class="chip${order.status === value ? ' is-active' : ''}"
                     data-order="${order.id}" data-status="${value}">${label}</button>`
        ).join('');

        return `
        <div class="order">
            <div class="order-head" data-toggle="${order.id}">
                <span class="order-ref">#${escapeHtml(String(order.id).slice(0, 8))}</span>
                <span class="order-customer">${escapeHtml(fullName(order))}</span>
                <span class="order-date">${escapeHtml(formatDate(order.created_at))}</span>
                <span class="badge ${escapeHtml(order.status || '')}">${escapeHtml(ORDER_STATUSES[order.status] || order.status || '')}</span>
                <span class="order-total">${money(order.total_amount)}</span>
            </div>

            ${open ? `
            <div class="order-body">
                ${lines || '<div class="order-line"><span>Sin líneas registradas</span></div>'}
                <div class="order-contact">
                    <div class="contact-row">
                        <span class="contact-label">Cliente</span>
                        <span>${escapeHtml(fullName(order))}</span>
                    </div>
                    <div class="contact-row">
                        <span class="contact-label">Correo</span>
                        ${order.customer_email
                ? `<a href="mailto:${escapeHtml(order.customer_email)}?subject=${encodeURIComponent('Tu pedido ' + String(order.id).slice(0, 8) + ' · Divina Providentia')}">${escapeHtml(order.customer_email)}</a>
                               <button class="lb-btn" data-copy="${escapeHtml(order.customer_email)}" title="Copiar correo">Copiar</button>`
                : '<span class="muted">No indicado</span>'}
                    </div>
                    <div class="contact-row">
                        <span class="contact-label">Teléfono</span>
                        ${order.customer_phone
                ? `<a href="tel:${escapeHtml(order.customer_phone.replace(/[^\d+]/g, ''))}">${escapeHtml(order.customer_phone)}</a>
                               <a class="lb-btn" target="_blank" rel="noopener"
                                  href="https://wa.me/${escapeHtml(order.customer_phone.replace(/\D/g, ''))}">WhatsApp</a>`
                : '<span class="muted">No indicado</span>'}
                    </div>
                    ${order.customer_message ? `
                    <div class="contact-row">
                        <span class="contact-label">Mensaje</span>
                        <span>${escapeHtml(order.customer_message)}</span>
                    </div>` : ''}
                </div>
                <div class="order-actions">
                    <span class="label">Estado</span>${buttons}
                </div>
                <div class="order-actions">
                    <button class="btn btn-danger" data-delete-order="${order.id}">Eliminar pedido</button>
                </div>
            </div>` : ''}
        </div>`;
    }).join('');

    list.querySelectorAll('[data-toggle]').forEach(head => {
        head.addEventListener('click', () => {
            const id = head.dataset.toggle;
            state.openOrderId = state.openOrderId === id ? null : id;
            renderOrders();
        });
    });

    list.querySelectorAll('.order-actions .chip').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            setOrderStatus(btn.dataset.order, btn.dataset.status);
        });
    });

    list.querySelectorAll('[data-delete-order]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteOrder(btn.dataset.deleteOrder);
        });
    });

    list.querySelectorAll('[data-copy]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                await navigator.clipboard.writeText(btn.dataset.copy);
                toast('Correo copiado');
            } catch (err) {
                toast('No se pudo copiar', true);
            }
        });
    });
}

async function deleteOrder(orderId) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) return;

    const ref = String(orderId).slice(0, 8);
    const ok = confirm(
        `¿Eliminar el pedido #${ref} de ${fullName(order)}?\n\n` +
        `Se borra el pedido y sus ${(order.order_items || []).length} línea(s), y deja de contar en los ingresos del resumen.\n\n` +
        `El stock NO se repone: si los artículos vuelven al almacén, ajústalos a mano en Productos.\n\n` +
        `Esta acción no se puede deshacer.`
    );
    if (!ok) return;

    // Primero las líneas y después la cabecera. Al revés, la clave ajena
    // de order_items lo impediría si la tabla no borra en cascada.
    const { error: itemsError } = await supabaseClient
        .from('order_items').delete().eq('order_id', orderId);

    if (itemsError) {
        toast('No se pudieron borrar las líneas del pedido', true);
        console.error(itemsError);
        return;
    }

    const { data, error } = await supabaseClient
        .from('orders').delete().eq('id', orderId).select();

    if (error || !data || data.length === 0) {
        toast('No se pudo eliminar el pedido', true);
        console.error(error);
        loadOrders();
        return;
    }

    state.orders = state.orders.filter(o => o.id !== orderId);
    if (state.openOrderId === orderId) state.openOrderId = null;

    renderOrders();
    loadStats();
    toast('Pedido eliminado');
}

async function setOrderStatus(orderId, status) {
    const { error } = await supabaseClient
        .from('orders')
        .update({ status })
        .eq('id', orderId);

    if (error) {
        toast('No se pudo cambiar el estado', true);
        console.error(error);
        return;
    }

    const order = state.orders.find(o => o.id === orderId);
    if (order) order.status = status;

    renderOrders();
    loadStats();
    toast('Pedido marcado como ' + (ORDER_STATUSES[status] || status));
}


// ===================================================================
// ARRANQUE
// ===================================================================

document.addEventListener('DOMContentLoaded', () => {
    $('loginForm').addEventListener('submit', handleLogin);
    $('logoutBtn').addEventListener('click', handleLogout);

    // Pestañas
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('is-active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('is-active'));
            tab.classList.add('is-active');
            $('panel-' + tab.dataset.tab).classList.add('is-active');
        });
    });

    // Productos
    $('newProductBtn').addEventListener('click', () => openProductForm(null));
    $('productForm').addEventListener('submit', saveProduct);
    $('closeProductBtn').addEventListener('click', closeProductForm);
    $('cancelProductBtn').addEventListener('click', closeProductForm);
    $('productOverlay').addEventListener('click', closeProductForm);
    $('deleteProductBtn').addEventListener('click', () => {
        deleteProduct($('pId').value, state.editing ? state.editing.name : 'este producto', true);
    });
    $('pSizes').addEventListener('change', onSizesChanged);
    $('pSizes').addEventListener('blur', onSizesChanged);
    $('pAvailable').addEventListener('change', refreshStockWarning);
    $('stockFields').addEventListener('input', refreshStockWarning);

    // Lookbook
    $('addLookbookBtn').addEventListener('click', () => $('lookbookFile').click());
    $('lookbookFile').addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length) addLookbookImages(files);
    });

    // Portada
    $('heroUploadBtn').addEventListener('click', () => $('heroFile').click());
    $('heroFile').addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) uploadHero(file);
    });
    $('heroRemoveBtn').addEventListener('click', removeHero);

    // Ajustes
    $('requireAccount').addEventListener('change', saveRequireAccount);

    // Apariencia
    $('themeControls').addEventListener('input', (e) => {
        const key = e.target.dataset.theme;
        if (!key) return;
        const raw = e.target.value;
        // Los desplegables de tipografía y los colores son texto; el
        // resto son números.
        state.theme[key] = /^(font|col)/.test(key) ? raw : Number(raw);
        renderTheme();
    });

    $('navTextAuto').addEventListener('change', (e) => {
        // Al desmarcar se arranca desde el color que ya se veía, para que
        // el cambio no dé un salto y se pueda ajustar desde ahí.
        state.theme.colNavText = e.target.checked ? '' : (state.theme.colText || DPTheme.DEFAULTS.colText);
        renderTheme();
    });

    $('heroAlignSeg').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-align]');
        if (!btn) return;
        state.theme.heroAlign = btn.dataset.align;
        renderTheme();
    });

    $('previewSizeSeg').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-w]');
        if (!btn) return;
        $('previewSizeSeg').querySelectorAll('button').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        $('themePreview').classList.toggle('is-mobile', btn.dataset.w === '390');
    });

    // El marco tarda en cargar y puede recargarse solo; cada vez hay que
    // volver a pintarle el borrador.
    $('themePreview').addEventListener('load', applyThemeToPreview);

    $('themeSaveBtn').addEventListener('click', saveTheme);
    $('themeResetBtn').addEventListener('click', resetTheme);

    // Pie de página
    $('footerControls').addEventListener('input', () => {
        state.footer = readFooterForm();
        markFooterDirty();
    });

    $('socialAddBtn').addEventListener('click', () => {
        addSocialRow(null);
        state.footer = readFooterForm();
        markFooterDirty();
    });

    $('socialRows').addEventListener('click', (e) => {
        const btn = e.target.closest('.repeater-remove');
        if (!btn) return;
        btn.closest('.repeater-row').remove();
        state.footer = readFooterForm();
        markFooterDirty();
    });

    $('footerSaveBtn').addEventListener('click', saveFooter);
    $('footerResetBtn').addEventListener('click', resetFooter);

    // Aviso al salir con cambios sin guardar.
    window.addEventListener('beforeunload', (e) => {
        if (themeIsDirty() || footerIsDirty()) { e.preventDefault(); e.returnValue = ''; }
    });

    $('pImageBtn').addEventListener('click', () => $('pImageFile').click());
    $('pImageFile').addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length) addGalleryFiles(files);
    });

    $('pAddColorBtn').addEventListener('click', () => {
        state.colors.push({ name: '', hex: '#000000' });
        renderColors();
    });

    // Pedidos
    $('orderFilters').addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        $('orderFilters').querySelectorAll('.chip').forEach(c => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        state.orderFilter = chip.dataset.status;
        renderOrders();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !$('productModal').hidden) closeProductForm();
    });

    boot();
});
