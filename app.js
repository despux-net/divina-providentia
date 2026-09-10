// ===================================
// DIVINA PROVIDENTIA — APP
// Tienda, lookbook, cartoteca y contacto.
// ===================================

if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}

const state = {
    cart: [],
    products: [],
    currentCategory: 'all',
    sort: 'new'
};

// ===================================
// INICIALIZACIÓN
// ===================================

document.addEventListener('DOMContentLoaded', () => {
    window.scrollTo(0, 0);
    initializeApp();
});

async function initializeApp() {
    initializeNavbar();
    initializeEventListeners();
    loadCartFromStorage();
    loadHeroImage();
    await loadSiteSettings();
    await loadProducts();
    await loadLookbookImages();
}

// ===================================
// NAVBAR
// ===================================

function initializeNavbar() {
    const navbar = document.getElementById('navbar');

    window.addEventListener('scroll', () => {
        navbar.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });

    const mobileMenuBtn = document.querySelector('.mobile-menu-button');
    const navLinks = document.querySelector('.nav-links');

    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            const open = navLinks.classList.toggle('active');
            mobileMenuBtn.setAttribute('aria-expanded', String(open));
        });

        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                mobileMenuBtn.setAttribute('aria-expanded', 'false');
            });
        });
    }

    // Menú de idioma accesible por teclado
    const langBtn = document.querySelector('.lang-btn');
    const langWrap = document.querySelector('.nav-lang');
    if (langBtn && langWrap) {
        langBtn.addEventListener('click', () => {
            const open = langWrap.classList.toggle('open');
            langBtn.setAttribute('aria-expanded', String(open));
        });
    }
}

// ===================================
// PRODUCTOS
// ===================================

async function loadProducts() {
    const productsGrid = document.getElementById('productsGrid');
    if (!productsGrid) return;

    productsGrid.innerHTML = '<div class="loading-spinner"><p>Cargando…</p></div>';

    try {
        const { data, error } = await window.SupabaseAPI.getProducts();

        if (error || !data || data.length === 0) {
            console.warn('Sin productos en Supabase:', error ? error.message : 'respuesta vacía');
            state.products = [];
        } else {
            state.products = data;
        }
    } catch (err) {
        console.error('Error cargando productos:', err);
        state.products = [];
    }

    buildFilterOptions();
    displayProducts();
}

function sortProducts(list, mode) {
    const out = list.slice();
    if (mode === 'price-asc') out.sort((a, b) => a.price - b.price);
    else if (mode === 'price-desc') out.sort((a, b) => b.price - a.price);
    else if (mode === 'name') out.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    else out.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return out;
}

// El desplegable de filtro se construye con las categorías que hay de
// verdad en el catálogo, no con una lista fija: así no ofrece filtros
// que no devuelven nada.
function buildFilterOptions() {
    const select = document.getElementById('shopFilter');
    if (!select) return;

    const counts = {};
    state.products.filter(p => productImages(p).length).forEach(p => {
        counts[p.category] = (counts[p.category] || 0) + 1;
    });

    const current = select.value || 'all';
    select.innerHTML = '<option value="all">Todo</option>' +
        Object.keys(counts).sort().map(cat =>
            `<option value="${escapeHtml(cat)}">${escapeHtml(getCategoryName(cat))} (${counts[cat]})</option>`
        ).join('');
    select.value = current;
    if (select.selectedIndex < 0) select.value = 'all';
}

function displayProducts() {
    const productsGrid = document.getElementById('productsGrid');
    if (!productsGrid) return;

    let filtered = state.currentCategory === 'all'
        ? state.products
        : state.products.filter(p => p.category === state.currentCategory);

    // Sólo se muestran productos con alguna foto.
    filtered = filtered.filter(p => productImages(p).length > 0);
    filtered = sortProducts(filtered, state.sort);

    const counter = document.getElementById('shopCount');
    if (counter) {
        counter.textContent = filtered.length === 1 ? '1 artículo' : `${filtered.length} artículos`;
    }

    if (filtered.length === 0) {
        productsGrid.innerHTML = '<div class="no-products"><p>No hay artículos en esta categoría</p></div>';
        return;
    }

    productsGrid.innerHTML = filtered.map(product => {
        const canBuy = isPurchasable(product);
        const hasSizes = productSizes(product).length > 0;
        const imgs = productImages(product);
        const colors = productColors(product);
        const wished = isWished(product.id);

        // Con tallas hay que elegir una, así que el botón lleva a la
        // ficha en lugar de añadir a ciegas.
        const href = `producto.html?id=${encodeURIComponent(product.id)}`;
        const action = hasSizes
            ? `location.href='${href}'`
            : `addToCart('${product.id}')`;

        // Metadatos breves: colores si los hay, si no las tallas.
        let meta = '';
        if (colors.length > 1) meta = `${colors.length} colores`;
        else if (colors.length === 1) meta = escapeHtml(colors[0].name);
        else if (hasSizes) {
            const sizes = productSizes(product);
            meta = sizes.length > 1 ? `${sizes.length} tallas` : `Talla ${escapeHtml(sizes[0])}`;
        }

        return `
    <article class="product-card ${!canBuy ? 'sold-out' : ''}" data-product-id="${product.id}" data-href="${href}" role="button" tabindex="0" aria-label="Ver ${escapeHtml(product.name)}">
      <div class="product-image-container">
        <img src="${escapeHtml(imgs[0])}" alt="${escapeHtml(product.name)}" loading="lazy" class="product-image-bg">
        ${imgs[1] ? `<img src="${escapeHtml(imgs[1])}" alt="" aria-hidden="true" loading="lazy" class="product-image-bg product-image-alt">` : ''}
        ${!canBuy ? '<div class="product-status-badge">Agotado</div>' : ''}

        <button class="wish-btn${wished ? ' is-active' : ''}" data-wish="${product.id}"
                aria-pressed="${wished}" aria-label="${wished ? 'Quitar de guardados' : 'Guardar artículo'}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
        </button>

        ${imgs.length > 1 ? `<div class="card-dots" aria-hidden="true">${
            imgs.map((_, i) => `<span class="card-dot${i === 0 ? ' is-active' : ''}"></span>`).join('')
        }</div>` : ''}

        <div class="product-info-overlay">
          <span class="product-category">${escapeHtml(getCategoryName(product.category))}</span>
        </div>
      </div>

      <div class="product-info">
        <h3 class="product-name">${escapeHtml(product.name)}</h3>
        ${meta ? `<p class="product-meta-line">${meta}</p>` : ''}
        ${colors.length ? `<div class="swatches" aria-hidden="true">${
            colors.slice(0, 5).map(c => `<span class="swatch" style="background:${escapeHtml(c.hex || '#fff')}" title="${escapeHtml(c.name)}"></span>`).join('')
        }</div>` : ''}
        <div class="product-footer">
          <span class="product-price">$${parseFloat(product.price).toFixed(2)}</span>
          <button class="add-to-cart-btn ${!canBuy ? 'disabled' : ''}"
                  onclick="event.stopPropagation(); ${canBuy ? action : ''}"
                  ${!canBuy ? 'disabled' : ''}>
            ${canBuy ? (hasSizes ? 'Elegir talla' : 'Añadir') : 'Agotado'}
          </button>
        </div>
      </div>
    </article>`;
    }).join('');

    productsGrid.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', () => {
            location.href = card.dataset.href;
        });
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                card.click();
            }
        });
    });

    // El corazón va dentro de la tarjeta, que abre la ficha al pulsarla:
    // sin stopPropagation, guardar abriría además el producto.
    productsGrid.querySelectorAll('[data-wish]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleWish(btn.dataset.wish, btn);
        });
    });
}

// ===================================
// PORTADA
// ===================================

// La imagen la elige el dueño desde el panel. Si no hay ninguna, la
// portada se queda como estaba: fondo blanco y rótulo en negro.
// Ajustes que el dueño controla desde el panel.
const siteSettings = { requireAccount: false };

async function loadSiteSettings() {
    if (!window.supabaseClient) return;
    try {
        let { data, error } = await window.supabaseClient
            .from('site_settings')
            .select('require_account, theme, footer')
            .eq('id', 1)
            .maybeSingle();

        // Mientras no se ejecute el SQL del pie esa columna no existe y
        // la consulta entera falla. Se reintenta sin ella: sería absurdo
        // perder el tema y el interruptor de cuenta por unos rótulos.
        if (error) {
            ({ data, error } = await window.supabaseClient
                .from('site_settings')
                .select('require_account, theme')
                .eq('id', 1)
                .maybeSingle());
        }

        if (!error && data) {
            siteSettings.requireAccount = !!data.require_account;

            // Los textos del pie. Si no hay nada guardado se deja el HTML
            // tal cual, que ya trae escritos los de fábrica.
            if (data.footer && window.DPFooter) {
                window.DPFooter.apply(data.footer);
            }

            // En la vista previa del panel manda el borrador que el
            // dueño está tocando, no lo que hay guardado: si se aplicara
            // aquí, machacaría sus cambios sin avisar.
            const isPreview = location.search.includes('preview');

            // El tema se guarda también en el navegador para poder
            // aplicarlo de inmediato en la siguiente visita, antes de
            // que dé tiempo a consultar la base.
            if (data.theme && window.DPTheme && !isPreview) {
                window.DPTheme.apply(data.theme);
                try {
                    localStorage.setItem('dpTheme', JSON.stringify(data.theme));
                } catch (e) { /* almacenamiento lleno o bloqueado */ }
            }
        }
    } catch (e) {
        // Ante la duda, no se bloquea la compra: el servidor tiene la
        // última palabra y rechazará el pedido si hiciera falta cuenta.
        console.warn('No se pudieron leer los ajustes:', e);
    }
}

async function loadHeroImage() {
    const hero = document.getElementById('inicio');
    if (!hero || !window.supabaseClient) return;

    try {
        const { data, error } = await window.supabaseClient
            .from('site_settings')
            .select('hero_image')
            .eq('id', 1)
            .maybeSingle();

        if (error || !data || !data.hero_image) return;

        // Se precarga antes de aplicarla para que no se vea el salto de
        // blanco a foto ni un rótulo blanco sobre fondo blanco.
        const img = new Image();
        img.onload = () => {
            hero.style.backgroundImage = `url("${data.hero_image}")`;
            hero.classList.add('has-image');
        };
        img.src = data.hero_image;
    } catch (e) {
        console.warn('No se pudo cargar la portada:', e);
    }
}

// ===================================
// TALLAS Y EXISTENCIAS
// ===================================

// Los artículos que no se venden por tallas (un anillo, una gorra) guardan
// sus existencias bajo esta clave única, para que el stock se descuente
// igual que en una prenda.
const SINGLE_SIZE = 'ÚNICA';

// Tallas que se ofrecen de un producto. Vacío = artículo sin tallas.
function productSizes(product) {
    return Array.isArray(product.sizes) ? product.sizes.filter(Boolean) : [];
}

function stockOf(product, size) {
    const stock = product.stock_by_size || {};
    return Math.max(0, parseInt(stock[size], 10) || 0);
}

// Suma de existencias. Devuelve null cuando el producto todavía no tiene
// stock configurado, para no dar por agotado lo que nunca se contó.
function totalStock(product) {
    const stock = product.stock_by_size || {};
    const keys = productSizes(product).length ? productSizes(product) : Object.keys(stock);
    if (!keys.length) return null;
    return keys.reduce((sum, size) => sum + stockOf(product, size), 0);
}

function isPurchasable(product) {
    if (product.available === false) return false;
    const total = totalStock(product);
    return total === null ? true : total > 0;
}

// Clave de línea de carrito: el mismo producto en dos tallas son dos líneas.
function lineKey(productId, size) {
    return `${productId}::${size || SINGLE_SIZE}`;
}

// ===================================
// GALERÍA, COLORES Y LISTA DE DESEOS
// ===================================

// Fotos de un producto. 'images' es la galería; si está vacía se usa la
// portada, que es lo que tienen los productos anteriores a la galería.
function productImages(product) {
    const gallery = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
    const files = gallery.length ? gallery : (product.image ? [product.image] : []);
    return files.map(f => /^https?:\/\//i.test(f)
        ? f
        : `${window.SUPABASE_URL}/storage/v1/object/public/products/${f}`);
}

function productColors(product) {
    return Array.isArray(product.colors) ? product.colors.filter(c => c && c.name) : [];
}

// La lista de deseos vive en el navegador: no hace falta cuenta para
// guardar algo, y así funciona igual con la tienda abierta o cerrada.
const WISH_KEY = 'divinaWishlist';

function getWishlist() {
    try {
        return JSON.parse(localStorage.getItem(WISH_KEY)) || [];
    } catch (e) {
        return [];
    }
}

function isWished(id) {
    return getWishlist().includes(String(id));
}

function toggleWish(id, btn) {
    const list = getWishlist();
    const key = String(id);
    const i = list.indexOf(key);

    if (i >= 0) list.splice(i, 1); else list.push(key);

    try {
        localStorage.setItem(WISH_KEY, JSON.stringify(list));
    } catch (e) { /* almacenamiento bloqueado: no es crítico */ }

    if (btn) {
        const active = i < 0;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
        btn.setAttribute('aria-label', active ? 'Quitar de guardados' : 'Guardar artículo');
    }
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getCategoryName(category) {
    const names = {
        vestments: 'Prendas',
        vestiment: 'Prendas',
        headwear: 'Gorras',
        accessories: 'Accesorios',
        prints: 'Impresiones'
    };
    return names[category] || category || '';
}

// ===================================
// FICHA AMPLIADA
// ===================================

function expandProductCardById(productId) {
    const product = state.products.find(p => p.id == productId);
    if (product) expandProductCard(product);
}

function expandProductCard(product) {
    closeProductExpand();

    const canBuy = isPurchasable(product);
    const sizes = productSizes(product);

    // Una talla sin existencias se muestra tachada pero no se puede elegir:
    // el cliente ve que existe y que se ha agotado.
    const sizesHtml = sizes.length ? `
                    <div class="size-picker" role="group" aria-label="Elegir talla">
                        <span class="size-picker-label">Talla</span>
                        <div class="size-options">
                            ${sizes.map(size => {
        const left = stockOf(product, size);
        const out = left <= 0;
        return `<button type="button" class="size-option${out ? ' out' : ''}"
                                        data-size="${escapeHtml(size)}"
                                        ${out ? 'disabled aria-disabled="true"' : ''}
                                        title="${out ? 'Agotada' : left + ' disponibles'}">${escapeHtml(size)}</button>`;
    }).join('')}
                        </div>
                        <p class="size-hint" id="sizeHint"></p>
                    </div>` : '';

    const panel = document.createElement('div');
    panel.id = 'productExpandPanel';
    panel.className = 'product-expand-panel';
    panel.innerHTML = `
        <div class="product-expand-backdrop"></div>
        <div class="product-expand-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(product.name)}">
            <button class="product-expand-close" onclick="closeProductExpand()" aria-label="Cerrar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>

            <div class="product-expand-body">
                <div class="product-expand-image-wrap" id="expandImageWrap">
                    <img src="${product.image_url}" alt="${escapeHtml(product.name)}" class="product-expand-img" id="expandImg" draggable="false">
                    <div class="magnifier-lens" id="magnifierLens" aria-hidden="true"></div>
                    <div class="magnifier-hint">Pasa el cursor para ampliar</div>
                </div>

                <div class="product-expand-info">
                    <span class="product-expand-cat">${escapeHtml(getCategoryName(product.category))}</span>
                    <h2 class="product-expand-name">${escapeHtml(product.name)}</h2>
                    <p class="product-expand-price">$${parseFloat(product.price).toFixed(2)}</p>
                    <div class="product-expand-divider"></div>
                    <p class="product-expand-desc">${escapeHtml(product.description || '')}</p>
                    ${sizesHtml}
                    <div class="product-expand-actions">
                        <button class="add-to-cart-btn product-expand-cart-btn ${!canBuy ? 'disabled' : ''}"
                                id="expandAddBtn"
                                ${!canBuy ? 'disabled' : ''}>
                            ${canBuy ? 'Añadir a la cesta' : 'Agotado'}
                        </button>
                    </div>
                </div>
            </div>
        </div>`;

    document.body.appendChild(panel);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
        requestAnimationFrame(() => panel.classList.add('open'));
    });

    panel.querySelector('.product-expand-backdrop').addEventListener('click', closeProductExpand);

    // Selección de talla
    let chosenSize = sizes.length ? null : SINGLE_SIZE;
    const hint = panel.querySelector('#sizeHint');
    panel.querySelectorAll('.size-option').forEach(btn => {
        btn.addEventListener('click', () => {
            panel.querySelectorAll('.size-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            chosenSize = btn.dataset.size;
            if (hint) hint.textContent = `Quedan ${stockOf(product, chosenSize)} unidades`;
        });
    });

    const addBtn = panel.querySelector('#expandAddBtn');
    if (addBtn && canBuy) {
        addBtn.addEventListener('click', () => {
            if (!chosenSize) {
                if (hint) hint.textContent = 'Elige una talla para continuar';
                panel.querySelector('.size-picker')?.classList.add('needs-choice');
                return;
            }
            addToCart(product.id, chosenSize);
            closeProductExpand();
        });
    }

    panel._escHandler = (e) => { if (e.key === 'Escape') closeProductExpand(); };
    document.addEventListener('keydown', panel._escHandler);

    const img = panel.querySelector('#expandImg');
    img.addEventListener('load', () => initMagnifier(panel), { once: true });
    if (img.complete) initMagnifier(panel);
}

function closeProductExpand() {
    const panel = document.getElementById('productExpandPanel');
    if (!panel) return;
    if (panel._escHandler) document.removeEventListener('keydown', panel._escHandler);
    panel.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => panel.remove(), 380);
}

// ===================================
// LUPA
// ===================================

function initMagnifier(panel) {
    const wrap = panel.querySelector('#expandImageWrap');
    const img = panel.querySelector('#expandImg');
    const lens = panel.querySelector('#magnifierLens');
    if (!wrap || !img || !lens) return;

    const ZOOM = 2.8;
    const LENS = 160;

    lens.style.width = LENS + 'px';
    lens.style.height = LENS + 'px';
    lens.style.backgroundImage = `url(${img.src})`;
    lens.style.backgroundRepeat = 'no-repeat';

    function onMove(e) {
        const rect = wrap.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        let x = clientX - rect.left;
        let y = clientY - rect.top;

        x = Math.max(LENS / 2, Math.min(x, rect.width - LENS / 2));
        y = Math.max(LENS / 2, Math.min(y, rect.height - LENS / 2));

        lens.style.left = (x - LENS / 2) + 'px';
        lens.style.top = (y - LENS / 2) + 'px';

        const bgX = (x / rect.width) * img.naturalWidth * ZOOM - LENS / 2;
        const bgY = (y / rect.height) * img.naturalHeight * ZOOM - LENS / 2;

        lens.style.backgroundSize = `${img.naturalWidth * ZOOM}px ${img.naturalHeight * ZOOM}px`;
        lens.style.backgroundPosition = `-${bgX}px -${bgY}px`;
        lens.style.opacity = '1';
        lens.style.transform = 'scale(1)';
    }

    function onLeave() {
        lens.style.opacity = '0';
        lens.style.transform = 'scale(0.5)';
    }

    wrap.addEventListener('mousemove', onMove);
    wrap.addEventListener('mouseleave', onLeave);
    wrap.addEventListener('touchmove', onMove, { passive: true });
    wrap.addEventListener('touchend', onLeave);
}

// ===================================
// LISTENERS
// ===================================

function initializeEventListeners() {
    document.getElementById('cartButton')?.addEventListener('click', openCart);
    document.getElementById('closeCartBtn')?.addEventListener('click', closeCart);
    document.getElementById('cartOverlay')?.addEventListener('click', closeCart);

    document.getElementById('checkoutBtn')?.addEventListener('click', openCheckout);
    document.getElementById('closeCheckoutBtn')?.addEventListener('click', closeCheckout);
    document.getElementById('checkoutOverlay')?.addEventListener('click', closeCheckout);

    document.getElementById('checkoutForm')?.addEventListener('submit', handleCheckout);
    document.getElementById('contactForm')?.addEventListener('submit', handleContact);

    document.getElementById('shopFilter')?.addEventListener('change', (e) => {
        state.currentCategory = e.target.value;
        displayProducts();
    });

    document.getElementById('shopSort')?.addEventListener('change', (e) => {
        state.sort = e.target.value;
        displayProducts();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeCart();
            closeCheckout();
        }
    });
}

// ===================================
// CESTA
// ===================================

function addToCart(productId, size) {
    const product = state.products.find(p => p.id == productId);
    if (!product) return;

    const chosen = size || SINGLE_SIZE;
    const key = lineKey(productId, chosen);
    const available = stockOf(product, chosen);
    const capped = totalStock(product) !== null;

    const existing = state.cart.find(item => item.key === key);
    const wanted = (existing ? existing.quantity : 0) + 1;

    // No se deja meter en la cesta más de lo que hay en el almacén.
    if (capped && wanted > available) {
        alert(`Solo quedan ${available} unidades de "${product.name}"${size ? ` en talla ${size}` : ''}.`);
        return;
    }

    if (existing) {
        existing.quantity = wanted;
    } else {
        state.cart.push({
            key,
            id: product.id,
            size: chosen,
            name: product.name,
            price: product.price,
            image_url: product.image_url,
            quantity: 1
        });
    }

    updateCart();
    saveCartToStorage();
    openCart();
}

function removeFromCart(key) {
    state.cart = state.cart.filter(item => item.key !== key);
    updateCart();
    saveCartToStorage();
}

function updateQuantity(key, change) {
    const item = state.cart.find(item => item.key === key);
    if (!item) return;

    if (change > 0) {
        const product = state.products.find(p => p.id == item.id);
        if (product && totalStock(product) !== null) {
            const available = stockOf(product, item.size);
            if (item.quantity + change > available) {
                alert(`Solo quedan ${available} unidades.`);
                return;
            }
        }
    }

    item.quantity += change;

    if (item.quantity <= 0) {
        removeFromCart(key);
    } else {
        updateCart();
        saveCartToStorage();
    }
}

function updateCart() {
    const cartCount = document.getElementById('cartCount');
    const cartItems = document.getElementById('cartItems');
    const cartTotal = document.getElementById('cartTotal');
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (!cartCount || !cartItems || !cartTotal || !checkoutBtn) return;

    const totalItems = state.cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    cartCount.textContent = totalItems;
    cartTotal.textContent = `$${totalPrice.toFixed(2)}`;

    if (state.cart.length === 0) {
        cartItems.innerHTML = '<div class="empty-cart"><p>Tu carrito está vacío</p></div>';
        checkoutBtn.disabled = true;
        return;
    }

    cartItems.innerHTML = state.cart.map(item => `
      <div class="cart-item">
        <div class="cart-item-image">
          ${item.image_url ? `<img src="${item.image_url}" alt="${escapeHtml(item.name)}">` : ''}
        </div>
        <div class="cart-item-details">
          <div class="cart-item-name">${escapeHtml(item.name)}</div>
          ${item.size && item.size !== SINGLE_SIZE ? `<div class="cart-item-size">Talla ${escapeHtml(item.size)}</div>` : ''}
          <div class="cart-item-price">$${parseFloat(item.price).toFixed(2)}</div>
          <div class="cart-item-controls">
            <button class="quantity-btn" onclick="updateQuantity('${item.key}', -1)" aria-label="Quitar una unidad">−</button>
            <span class="cart-item-quantity">${item.quantity}</span>
            <button class="quantity-btn" onclick="updateQuantity('${item.key}', 1)" aria-label="Añadir una unidad">+</button>
            <button class="remove-item-btn" onclick="removeFromCart('${item.key}')" aria-label="Eliminar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>`).join('');

    checkoutBtn.disabled = false;
}

function saveCartToStorage() {
    localStorage.setItem('divinaCart', JSON.stringify(state.cart));
}

function loadCartFromStorage() {
    const saved = localStorage.getItem('divinaCart');
    if (!saved) return;
    try {
        const parsed = JSON.parse(saved);
        // Cestas guardadas antes de que existieran las tallas no traen
        // 'key' ni 'size'; se les pone la talla única para no perderlas.
        state.cart = parsed.map(item => ({
            ...item,
            size: item.size || SINGLE_SIZE,
            key: item.key || lineKey(item.id, item.size || SINGLE_SIZE)
        }));
        updateCart();
    } catch (e) {
        localStorage.removeItem('divinaCart');
    }
}

function openCart() {
    document.getElementById('cartModal')?.classList.add('open');
    document.getElementById('cartOverlay')?.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeCart() {
    document.getElementById('cartModal')?.classList.remove('open');
    document.getElementById('cartOverlay')?.classList.remove('open');
    document.body.style.overflow = '';
}

// ===================================
// CHECKOUT
// ===================================

// Con el interruptor encendido no se abre el checkout sin sesión: se
// manda al cliente a identificarse. Es solo comodidad — quien mande la
// petición a mano se topará igualmente con la comprobación del servidor.
async function requireAccountOrPrompt() {
    if (!siteSettings.requireAccount) return true;

    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (session) return true;
    } catch (e) {
        console.warn('No se pudo comprobar la sesión:', e);
        return true;
    }

    closeCart();
    alert('Para comprar hay que tener una cuenta. Inicia sesión o regístrate y tu carrito se conservará.');
    if (typeof openModal === 'function') openModal('loginModal');
    return false;
}

async function openCheckout() {
    if (!await requireAccountOrPrompt()) return;

    closeCart();

    const orderSummaryItems = document.getElementById('orderSummaryItems');
    const orderTotal = document.getElementById('orderTotal');
    const totalPrice = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    if (orderSummaryItems) {
        orderSummaryItems.innerHTML = state.cart.map(item => `
    <div class="order-item">
      <span>${escapeHtml(item.name)}${item.size && item.size !== SINGLE_SIZE ? ` · ${escapeHtml(item.size)}` : ''} ×${item.quantity}</span>
      <span>$${(item.price * item.quantity).toFixed(2)}</span>
    </div>`).join('');
    }
    if (orderTotal) orderTotal.textContent = `$${totalPrice.toFixed(2)}`;

    document.getElementById('checkoutModal')?.classList.add('open');
    document.getElementById('checkoutOverlay')?.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeCheckout() {
    document.getElementById('checkoutModal')?.classList.remove('open');
    document.getElementById('checkoutOverlay')?.classList.remove('open');
    document.body.style.overflow = '';
    document.getElementById('checkoutForm')?.reset();
}

async function handleCheckout(e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('.submit-order-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando…';

    const formData = new FormData(e.target);
    const name = formData.get('customerName');
    const surname = formData.get('customerSurname');
    const email = formData.get('customerEmail');
    const phone = formData.get('customerPhone');
    const message = formData.get('customerMessage') || '';

    try {
        // 1. La venta se registra primero. Si esto falla (sin stock, precio
        //    cambiado, producto retirado) no se avisa a nadie y el cliente
        //    ve el motivo real.
        const { data, error } = await window.SupabaseAPI.placeOrder({
            name, surname, email, phone, message, items: state.cart
        });

        if (error) throw error;

        const orderId = data && data.order_id ? data.order_id : null;
        const total = data && data.total != null
            ? Number(data.total)
            : state.cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

        // 2. El aviso de Telegram es secundario: si falla, el pedido ya
        //    está guardado y visible en el panel, así que no se pierde.
        try {
            await fetch(
                'https://nzwtafacdpdgulzcwntx.supabase.co/functions/v1/send-telegram-order',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        customerName: `${name} ${surname}`.trim(),
                        customerPhone: `${phone} · ${email}`,
                        customerMessage: message,
                        items: state.cart.map(item => ({
                            name: item.size && item.size !== SINGLE_SIZE
                                ? `${item.name} (${item.size})`
                                : item.name,
                            price: item.price,
                            quantity: item.quantity
                        })),
                        total
                    })
                }
            );
        } catch (notifyError) {
            console.warn('El pedido se guardó, pero falló el aviso de Telegram:', notifyError);
        }

        showSuccessMessage(orderId ? orderId.slice(0, 8).toUpperCase() : 'DP-' + Date.now());

        state.cart = [];
        updateCart();
        saveCartToStorage();

        // El stock ha cambiado: se recarga para que la tienda lo refleje.
        loadProducts();
    } catch (error) {
        console.error('Error registrando el pedido:', error);
        alert(error.message || 'Hubo un error al enviar tu pedido. Por favor, inténtalo de nuevo.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirmar pedido';
    }
}

function showSuccessMessage(orderId) {
    const checkoutContent = document.getElementById('checkoutContent');
    if (!checkoutContent) return;

    checkoutContent.innerHTML = `
    <div class="success-message">
      <div class="success-icon">✓</div>
      <h3>Pedido confirmado</h3>
      <p>Gracias por tu compra. Nos pondremos en contacto contigo en breve.</p>
      <p>Número de pedido: <span class="order-id">${orderId}</span></p>
      <button class="cta-button" onclick="closeCheckoutAndReset()" style="margin-top:24px">Seguir comprando</button>
    </div>`;
}

function closeCheckoutAndReset() {
    closeCheckout();

    setTimeout(() => {
        const checkoutContent = document.getElementById('checkoutContent');
        if (!checkoutContent) return;

        checkoutContent.innerHTML = `
      <form class="checkout-form" id="checkoutForm">
        <div class="order-summary">
          <h3>Resumen</h3>
          <div id="orderSummaryItems"></div>
          <div class="order-total"><span>Total</span><span id="orderTotal">$0.00</span></div>
        </div>
        <div class="form-group">
          <label for="customerName">Nombre completo *</label>
          <input type="text" id="customerName" name="customerName" required placeholder="Tu nombre">
        </div>
        <div class="form-group">
          <label for="customerPhone">Teléfono / WhatsApp *</label>
          <input type="tel" id="customerPhone" name="customerPhone" required placeholder="+1 234 567 8900">
        </div>
        <div class="form-group">
          <label for="customerMessage">Mensaje (opcional)</label>
          <textarea id="customerMessage" name="customerMessage" rows="3" placeholder="Dirección de envío, instrucciones especiales…"></textarea>
        </div>
        <button type="submit" class="submit-order-btn">Confirmar pedido</button>
      </form>`;

        document.getElementById('checkoutForm').addEventListener('submit', handleCheckout);
    }, 300);
}

// ===================================
// LOOKBOOK
// ===================================

async function loadLookbookImages() {
    const container = document.getElementById('lookbookCarousel');
    if (!container) return;

    const { data, error } = await SupabaseAPI.getLookbookImages();

    if (error || !data || data.length === 0) {
        container.innerHTML = '<div class="loading-spinner"><p>No hay imágenes disponibles</p></div>';
        return;
    }

    // Se duplica la serie para que el desplazamiento sea continuo.
    const slides = [...data, ...data].map((img, index) => `
        <div class="carousel-slide">
            <img src="${img.image_url}" alt="Lookbook ${(index % data.length) + 1}" loading="lazy">
        </div>`).join('');

    container.innerHTML = `<div class="carousel-track">${slides}</div>`;
}

// ===================================
// CONTACTO
// ===================================

async function handleContact(e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('.footer-submit-btn');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando…';

    const nombre = document.getElementById('contactName').value;
    const email = document.getElementById('contactEmail').value;
    const mensaje = document.getElementById('contactMessage').value;

    try {
        // 1. Primero se guarda. Si esto falla, el visitante ve el error y
        //    puede reintentar; nada se pierde en silencio.
        const { error } = await window.supabaseClient
            .from('mensajes_contacto')
            .insert([{ nombre, email, mensaje }]);

        if (error) throw error;

        // 2. El aviso a Telegram es secundario, igual que en los pedidos:
        //    si falla, el mensaje ya está guardado en la base de datos.
        try {
            await fetch(
                'https://nzwtafacdpdgulzcwntx.supabase.co/functions/v1/send-telegram-order',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'contact',
                        name: nombre,
                        email: email,
                        message: mensaje
                    })
                }
            );
        } catch (notifyError) {
            console.warn('El mensaje se guardó, pero falló el aviso de Telegram:', notifyError);
        }

        submitBtn.textContent = 'Enviado';
        e.target.reset();

        setTimeout(() => {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }, 3000);
    } catch (error) {
        console.error('Error enviando el mensaje:', error);
        alert('No se pudo enviar el mensaje. Inténtalo de nuevo más tarde.');
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}
