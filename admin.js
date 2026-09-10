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

function renderProducts() {
    const list = $('productsList');

    if (!state.products.length) {
        list.innerHTML = '<div class="loading">Todavía no hay productos</div>';
        return;
    }

    list.innerHTML = state.products.map(product => {
        const url = imageUrl(product.image);
        const stock = product.stock_by_size || {};
        const pills = stockKeys(product).map(size => {
            const n = parseInt(stock[size], 10) || 0;
            const label = size === SINGLE_SIZE ? '' : size + ' ';
            return `<span class="stock-pill${n === 0 ? ' zero' : ''}">${escapeHtml(label)}${n}</span>`;
        }).join('');

        return `
        <div class="prod-row" data-id="${product.id}">
            <div class="prod-thumb">
                ${url ? `<img src="${escapeHtml(url)}" alt="" loading="lazy">` : ''}
            </div>
            <div class="prod-main">
                <div class="prod-name">${escapeHtml(product.name)}</div>
                <div class="prod-meta">${escapeHtml(CATEGORY_NAMES[product.category] || product.category || '')}</div>
                <div class="prod-stock">${pills}</div>
            </div>
            <div class="prod-price">${money(product.price)}</div>
            <div class="prod-flags">
                <span class="flag ${product.published ? 'on' : 'off'}">${product.published ? 'Publicado' : 'Borrador'}</span>
                <span class="flag ${product.available ? 'on' : 'off'}">${product.available ? 'A la venta' : 'Agotado'}</span>
            </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.prod-row').forEach(row => {
        row.addEventListener('click', () => {
            const product = state.products.find(p => String(p.id) === row.dataset.id);
            if (product) openProductForm(product);
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
    $('productError').textContent = '';
    $('pImageName').textContent = '';
    $('pImageFile').value = '';

    const url = product ? imageUrl(product.image) : null;
    $('pImagePreview').innerHTML = url ? `<img src="${escapeHtml(url)}" alt="">` : '';

    renderStockFields(
        product ? sizesOf(product) : [],
        product ? product.stock_by_size : {}
    );

    $('deleteProductBtn').hidden = !product;

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
            published: $('pPublished').checked,
            available: $('pAvailable').checked
        };

        if (!payload.name) throw new Error('El nombre es obligatorio.');
        if (!(payload.price >= 0)) throw new Error('El precio no es válido.');

        if (state.pendingImage) {
            btn.textContent = 'Subiendo imagen…';
            payload.image = await uploadImage(state.pendingImage);
        }

        const id = $('pId').value;
        const query = id
            ? supabaseClient.from('products').update(payload).eq('id', id)
            : supabaseClient.from('products').insert([payload]);

        const { error } = await query;
        if (error) throw error;

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

async function deleteProduct() {
    const id = $('pId').value;
    if (!id) return;

    const name = state.editing ? state.editing.name : 'este producto';
    if (!confirm(`¿Eliminar "${name}"? Esta acción no se puede deshacer.`)) return;

    const { error } = await supabaseClient.from('products').delete().eq('id', id);

    if (error) {
        // Un pedido antiguo puede seguir apuntando al producto.
        $('productError').textContent =
            'No se pudo eliminar. Si el producto aparece en algún pedido, desmárcalo como publicado en lugar de borrarlo.';
        console.error(error);
        return;
    }

    closeProductForm();
    toast('Producto eliminado');
    loadProducts();
    loadStats();
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
                <span class="order-customer">${escapeHtml(order.customer_name || 'Sin nombre')}</span>
                <span class="order-date">${escapeHtml(formatDate(order.created_at))}</span>
                <span class="badge ${escapeHtml(order.status || '')}">${escapeHtml(ORDER_STATUSES[order.status] || order.status || '')}</span>
                <span class="order-total">${money(order.total_amount)}</span>
            </div>

            ${open ? `
            <div class="order-body">
                ${lines || '<div class="order-line"><span>Sin líneas registradas</span></div>'}
                <div class="order-contact">
                    ${order.customer_phone ? `Teléfono: <a href="tel:${escapeHtml(order.customer_phone)}">${escapeHtml(order.customer_phone)}</a>` : 'Sin teléfono'}
                    ${order.customer_message ? `<br>Mensaje: ${escapeHtml(order.customer_message)}` : ''}
                </div>
                <div class="order-actions">
                    <span class="label">Estado</span>${buttons}
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
    $('deleteProductBtn').addEventListener('click', deleteProduct);
    $('pSizes').addEventListener('change', onSizesChanged);
    $('pSizes').addEventListener('blur', onSizesChanged);

    $('pImageBtn').addEventListener('click', () => $('pImageFile').click());
    $('pImageFile').addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        state.pendingImage = file;
        $('pImageName').textContent = file.name;
        const reader = new FileReader();
        reader.onload = (ev) => {
            $('pImagePreview').innerHTML = `<img src="${ev.target.result}" alt="">`;
        };
        reader.readAsDataURL(file);
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
