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
    currentCategory: 'all'
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

    displayProducts();
}

function displayProducts() {
    const productsGrid = document.getElementById('productsGrid');
    if (!productsGrid) return;

    let filtered = state.currentCategory === 'all'
        ? state.products
        : state.products.filter(p => p.category === state.currentCategory);

    // Sólo se muestran productos con imagen.
    filtered = filtered.filter(p => p.image_url);

    if (filtered.length === 0) {
        productsGrid.innerHTML = '<div class="no-products"><p>No hay artículos disponibles</p></div>';
        return;
    }

    productsGrid.innerHTML = filtered.map(product => {
        const isAvailable = product.available !== false;
        return `
    <div class="product-card ${!isAvailable ? 'sold-out' : ''}" data-product-id="${product.id}" role="button" tabindex="0" aria-label="Ver ${escapeHtml(product.name)}">
      <div class="product-image-container">
        <img src="${product.image_url}" alt="${escapeHtml(product.name)}" loading="lazy" class="product-image-bg">
        ${!isAvailable ? '<div class="product-status-badge">Agotado</div>' : ''}
        <div class="product-expand-hint">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
          Ver
        </div>
        <div class="product-info-overlay">
          <span class="product-category">${escapeHtml(getCategoryName(product.category))}</span>
          <h3 class="product-name">${escapeHtml(product.name)}</h3>
        </div>
      </div>
      <div class="product-info">
        <p class="product-description">${escapeHtml(product.description || '')}</p>
        <div class="product-footer">
          <span class="product-price">$${parseFloat(product.price).toFixed(2)}</span>
          <button class="add-to-cart-btn ${!isAvailable ? 'disabled' : ''}"
                  onclick="event.stopPropagation(); ${isAvailable ? `addToCart('${product.id}')` : ''}"
                  ${!isAvailable ? 'disabled' : ''}>
            ${isAvailable ? 'Añadir' : 'Agotado'}
          </button>
        </div>
      </div>
    </div>`;
    }).join('');

    productsGrid.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', () => {
            const productId = card.getAttribute('data-product-id');
            const product = state.products.find(p => p.id == productId);
            if (product) expandProductCard(product);
        });
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                card.click();
            }
        });
    });
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

function expandProductCard(product) {
    closeProductExpand();

    const isAvailable = product.available !== false;
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
                    <div class="product-expand-actions">
                        <button class="add-to-cart-btn product-expand-cart-btn ${!isAvailable ? 'disabled' : ''}"
                                onclick="${isAvailable ? `addToCart('${product.id}'); closeProductExpand();` : ''}"
                                ${!isAvailable ? 'disabled' : ''}>
                            ${isAvailable ? 'Añadir a la cesta' : 'Agotado'}
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

function addToCart(productId) {
    const product = state.products.find(p => p.id == productId);
    if (!product) return;

    const existing = state.cart.find(item => item.id == productId);
    if (existing) {
        existing.quantity += 1;
    } else {
        state.cart.push({ ...product, quantity: 1 });
    }

    updateCart();
    saveCartToStorage();
    openCart();
}

function removeFromCart(productId) {
    state.cart = state.cart.filter(item => item.id != productId);
    updateCart();
    saveCartToStorage();
}

function updateQuantity(productId, change) {
    const item = state.cart.find(item => item.id == productId);
    if (!item) return;

    item.quantity += change;

    if (item.quantity <= 0) {
        removeFromCart(productId);
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
          <div class="cart-item-price">$${parseFloat(item.price).toFixed(2)}</div>
          <div class="cart-item-controls">
            <button class="quantity-btn" onclick="updateQuantity('${item.id}', -1)" aria-label="Quitar una unidad">−</button>
            <span class="cart-item-quantity">${item.quantity}</span>
            <button class="quantity-btn" onclick="updateQuantity('${item.id}', 1)" aria-label="Añadir una unidad">+</button>
            <button class="remove-item-btn" onclick="removeFromCart('${item.id}')" aria-label="Eliminar">
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
        state.cart = JSON.parse(saved);
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

function openCheckout() {
    closeCart();

    const orderSummaryItems = document.getElementById('orderSummaryItems');
    const orderTotal = document.getElementById('orderTotal');
    const totalPrice = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    if (orderSummaryItems) {
        orderSummaryItems.innerHTML = state.cart.map(item => `
    <div class="order-item">
      <span>${escapeHtml(item.name)} ×${item.quantity}</span>
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
    const totalPrice = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const orderData = {
        customerName: formData.get('customerName'),
        customerPhone: formData.get('customerPhone'),
        customerMessage: formData.get('customerMessage') || '',
        items: state.cart.map(item => ({
            name: item.name,
            price: item.price,
            quantity: item.quantity
        })),
        total: totalPrice
    };

    try {
        const response = await fetch(
            'https://nzwtafacdpdgulzcwntx.supabase.co/functions/v1/send-telegram-order',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            }
        );

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Error al enviar el pedido');
        }

        showSuccessMessage('DP-' + Date.now());

        state.cart = [];
        updateCart();
        saveCartToStorage();
    } catch (error) {
        console.error('Error enviando el pedido:', error);
        alert('Hubo un error al enviar tu pedido. Por favor, inténtalo de nuevo.');
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
        const { error } = await window.supabaseClient
            .from('mensajes_contacto')
            .insert([{ nombre, email, mensaje }]);

        if (error) throw error;

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
