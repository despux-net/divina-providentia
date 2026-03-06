// ===================================
// DIVINA PROVIDENTIA - MAIN APP
// ===================================

if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}

// Stoic Quotes for Hero Section
const stoicQuotes = [
    {
        quote: "No envidiéis a los hombres violentos, ni escojáis ninguno de sus caminos; porque el Señor abomina al perverso.",
        author: "Proverbios 3:31-32"
    },
    {
        quote: "Toda verdad es una sombra de Dios; todo error, una usurpación del hombre.",
        author: "Donoso Cortés"
    },
    {
        quote: "La libertad no es hacer lo que se quiere, sino tener el derecho de hacer lo que se debe.",
        author: "Lord Acton"
    },
    {
        quote: "En los tiempos de la anarquía universal, la única rebeldía posible es el Orden.",
        author: "Gómez Dávila"
    },
    {
        quote: "Revístete de toda la armadura de Dios, para que podáis estar firmes contra las asechanzas del diablo.",
        author: "Efesios 6:11"
    },
    {
        quote: "El principio de la sabiduría es el temor de Dios; los insensatos desprecian la sabiduría y la enseñanza.",
        author: "Proverbios 1:7"
    },
    {
        quote: "La tradición no es la adoración de las cenizas, sino la preservación del fuego.",
        author: "G.K. Chesterton"
    },
    {
        quote: "No hay civilización sin jerarquía, ni jerarquía sin sacrificio.",
        author: "Joseph de Maistre"
    }
];

// Application State
const state = {
    cart: [],
    products: [],
    currentCategory: 'all',
    currentQuoteIndex: 0
};

// ===================================
// INITIALIZATION
// ===================================

document.addEventListener('DOMContentLoaded', () => {
    window.scrollTo(0, 0);
    initializeApp();
});

async function initializeApp() {
    // Initialize hero quote rotation
    displayQuote();
    setInterval(rotateQuote, 8000);

    // Initialize navbar scroll effect
    initializeNavbar();

    // Load products from Supabase
    await loadProducts();

    // Load articles from Supabase
    if (typeof loadArticles === 'function') {
        await loadArticles();
    }

    // Initialize event listeners
    initializeEventListeners();

    // Load cart from localStorage
    loadCartFromStorage();

    // Initialize scroll animations AFTER possible content injection
    setTimeout(() => {
        initializeScrollAnimations();
    }, 500); // 500ms delay to ensure content.json is fetched and rendered
}

// ===================================
// HERO QUOTE ROTATION
// ===================================

function displayQuote() {
    const quoteElement = document.querySelector('#heroQuote blockquote');
    const authorElement = document.querySelector('#heroQuote cite');
    const currentQuote = stoicQuotes[state.currentQuoteIndex];

    if (quoteElement && authorElement) {
        quoteElement.style.opacity = '0';
        authorElement.style.opacity = '0';

        setTimeout(() => {
            quoteElement.textContent = currentQuote.quote;
            authorElement.textContent = `— ${currentQuote.author}`;
            quoteElement.style.opacity = '1';
            authorElement.style.opacity = '1';
        }, 1200);
    }
}

function rotateQuote() {
    state.currentQuoteIndex = (state.currentQuoteIndex + 1) % stoicQuotes.length;
    displayQuote();
}

// ===================================
// NAVBAR SCROLL EFFECT
// ===================================

function initializeNavbar() {
    const navbar = document.getElementById('navbar');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });


    // Mobile menu toggle
    const mobileMenuBtn = document.querySelector('.mobile-menu-button');
    const navLinks = document.querySelector('.nav-links');

    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });

        // Close menu when clicking a link
        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
            });
        });
    }
}

// ===================================
// SCROLL ANIMATIONS
// ===================================

// Create global observer for reuse (e.g. dynamically added products)
const scrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        } else {
            // Remove class so it animates again when scrolling up/down
            entry.target.classList.remove('visible');
        }
    });
}, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });

function initializeScrollAnimations() {
    // Observe core static elements
    const selectors = [
        '.philosophy-card',
        '.syllabus-card',
        '.section-title',
        '.about-text',
        '.contact-container',
        '.footer-section',
        '.lookbook-section',
        '.hero-content'
    ];

    document.querySelectorAll(selectors.join(', ')).forEach(el => {
        scrollObserver.observe(el);
    });
}

// ===================================
// PRODUCTS MANAGEMENT
// ===================================

async function loadProducts() {
    const productsGrid = document.getElementById('productsGrid');
    productsGrid.innerHTML = '<div class="loading-spinner"><p>Cargando productos...</p></div>';

    console.log('🔄 loadProducts() iniciado');
    console.log('📦 window.SupabaseAPI:', window.SupabaseAPI);

    // Try to fetch from Supabase
    try {
        console.log('🔌 Llamando a getProducts()...');
        const { data, error } = await window.SupabaseAPI.getProducts();

        console.log('📊 Respuesta recibida:');
        console.log('   Data:', data);
        console.log('   Error:', error);
        console.log('   Data length:', data ? data.length : 'null');

        if (error || !data || data.length === 0) {
            // Use demo products if Supabase is not set up yet
            console.warn('⚠️ Usando productos demo. Razón:', error ? error.message : 'No hay datos');
            state.products = getDemoProducts();
        } else {
            console.log('✅ Usando productos de Supabase:', data.length, 'productos');
            state.products = data;
        }

        displayProducts();
    } catch (err) {
        console.error('❌ Error en loadProducts():', err);
        state.products = getDemoProducts();
        displayProducts();
    }
}

function getDemoProducts() {
    return [
        {
            id: '1',
            name: 'Gorra Hilo de Oro',
            description: 'El peso de lo que eliges portar. La cruz dorada en la frente es un recordatorio físico de tu adhesión a la Verdad invariable; una declaración frontal contra el relativismo de la modernidad líquida. Forjada con algodón de alta densidad y costuras reforzadas, estructurada para resistir el paso de los años con inquebrantable firmeza.',
            price: 29.99,
            category: 'headwear',
            image: null,
            stock: 10
        },
        {
            id: '2',
            name: 'Polo Negro con Símbolo',
            description: 'La coraza del Logos. Llevar esta insignia sobre el pecho es alinear el latido con un Orden Superior. Este estandarte te compromete a ser un bastión de integridad en un mundo disuelto. Tejida en hilado natural orgánico pesado, su caída refleja gravedad y pureza, evitando concesiones sintéticas.',
            price: 49.99,
            category: 'vestments',
            image: null,
            stock: 8
        },
        {
            id: '3',
            name: 'Gorra San Miguel',
            description: 'El yelmo del Arcángel. La lucha contra las sombras de la modernidad exige protección no solo física, sino espiritual. El yelmo simboliza la coraza de la virtud, aislando la mente de las frivolidades para enfocarse en la defensa de la civilización. Detalle bordado en hilo de resistencia superior sobre lona de estructura profunda.',
            price: 34.99,
            category: 'headwear',
            image: null,
            stock: 15
        },
        {
            id: '4',
            name: 'Medalla Tradición',
            description: 'Reivindicación de la memoria. Una reliquia forjada en recordatorio de los pilares que fundaron Occidente. Penderla del cuello no es un adorno, es asumir la herencia innegociable de la Fe y la Razón frente al olvido. Creada en aleación sólida, envejecida a mano para perdurar inalterable ante el paso de los siglos.',
            price: 45.00,
            category: 'accessories',
            image: null,
            stock: 12
        },
        {
            id: '5',
            name: 'Camisa Blanca Rectitud',
            description: 'La túnica del guerrero cotidiano. La sencillez radiante como repudio a los artificios del engaño posmoderno. Una primera capa que representa la pureza de intenciones al empezar el día de combate cultural. Confeccionada con algodón de 300g, corte arquitectónico y precisión monástica en sus detalles.',
            price: 42.00,
            category: 'vestments',
            image: null,
            stock: 50
        }
    ];
}

function displayProducts() {
    const productsGrid = document.getElementById('productsGrid');

    // Filter by category
    let filteredProducts = state.currentCategory === 'all'
        ? state.products
        : state.products.filter(p => p.category === state.currentCategory);

    // IMPORTANT: Only show products that have images
    filteredProducts = filteredProducts.filter(p => p.image_url);

    if (filteredProducts.length === 0) {
        productsGrid.innerHTML = '<div class="no-products"><p>No hay productos con imágenes en esta categoría.</p></div>';
        return;
    }

    productsGrid.innerHTML = filteredProducts.map(product => {
        const isAvailable = product.available !== false;
        return `
    <div class="product-card ${!isAvailable ? 'sold-out' : ''}" data-product-id="${product.id}" role="button" tabindex="0" aria-label="Ver detalles de ${product.name}">
      <div class="product-image-container">
        <img src="${product.image_url}" alt="${product.name}" loading="lazy" class="product-image-bg">
        <div class="product-image-overlay"></div>
        ${!isAvailable ? '<div class="product-status-badge">AGOTADO</div>' : ''}
        <div class="product-info-overlay">
          <div class="product-category">${getCategoryName(product.category)}</div>
          <h3 class="product-name">${product.name}</h3>
        </div>
        <div class="product-expand-hint">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
          Ver detalles
        </div>
      </div>
      <div class="product-info">
        <p class="product-description">${product.description ? product.description.substring(0, 120) + '...' : ''}</p>
        <div class="product-footer">
          <span class="product-price">$${parseFloat(product.price).toFixed(2)}</span>
          <button class="add-to-cart-btn ${!isAvailable ? 'disabled' : ''}"
                  onclick="event.stopPropagation(); ${isAvailable ? `addToCart('${product.id}')` : ''}"
                  ${!isAvailable ? 'disabled' : ''}>
            ${isAvailable ? 'Agregar' : 'Agotado'}
          </button>
        </div>
      </div>
    </div>
  `}).join('');

    // Attach click listeners for expand
    document.querySelectorAll('.product-card').forEach((card, index) => {
        card.style.transitionDelay = `${(index % 4) * 0.1}s`;
        scrollObserver.observe(card);

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

// ===================================
// PRODUCT EXPAND PANEL
// ===================================

function expandProductCard(product) {
    // Remove any existing panel
    closeProductExpand();

    const isAvailable = product.available !== false;
    const panel = document.createElement('div');
    panel.id = 'productExpandPanel';
    panel.className = 'product-expand-panel';
    panel.innerHTML = `
        <div class="product-expand-backdrop"></div>
        <div class="product-expand-modal" role="dialog" aria-modal="true" aria-label="${product.name}">
            <button class="product-expand-close" onclick="closeProductExpand()" aria-label="Cerrar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>

            <div class="product-expand-body">
                <!-- Image side with magnifier -->
                <div class="product-expand-image-wrap" id="expandImageWrap">
                    <img src="${product.image_url}" alt="${product.name}" class="product-expand-img" id="expandImg" draggable="false">
                    <!-- Magnifier lens -->
                    <div class="magnifier-lens" id="magnifierLens" aria-hidden="true"></div>
                    <div class="magnifier-hint">🔍 Pasa el cursor para ampliar</div>
                </div>

                <!-- Info side -->
                <div class="product-expand-info">
                    <span class="product-expand-cat">${getCategoryName(product.category)}</span>
                    <h2 class="product-expand-name">${product.name}</h2>
                    <p class="product-expand-price">$${parseFloat(product.price).toFixed(2)}</p>
                    <div class="product-expand-divider"></div>
                    <p class="product-expand-desc">${product.description || ''}</p>
                    <div class="product-expand-actions">
                        <button class="add-to-cart-btn product-expand-cart-btn ${!isAvailable ? 'disabled' : ''}"
                                onclick="${isAvailable ? `addToCart('${product.id}'); closeProductExpand();` : ''}"
                                ${!isAvailable ? 'disabled' : ''}>
                            ${isAvailable ? '⚔ Agregar al Arsenal' : 'Agotado'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(panel);
    document.body.style.overflow = 'hidden';

    // Animate in
    requestAnimationFrame(() => {
        requestAnimationFrame(() => panel.classList.add('open'));
    });

    // Close on backdrop click
    panel.querySelector('.product-expand-backdrop').addEventListener('click', closeProductExpand);

    // ESC key close
    panel._escHandler = (e) => { if (e.key === 'Escape') closeProductExpand(); };
    document.addEventListener('keydown', panel._escHandler);

    // Initialize magnifier after image loads
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
// IMAGE MAGNIFIER (LOUPE)
// ===================================

function initMagnifier(panel) {
    const wrap = panel.querySelector('#expandImageWrap');
    const img = panel.querySelector('#expandImg');
    const lens = panel.querySelector('#magnifierLens');
    const ZOOM = 2.8;
    const LENSW = 160;
    const LENSH = 160;

    lens.style.width = LENSW + 'px';
    lens.style.height = LENSH + 'px';
    lens.style.backgroundImage = `url(${img.src})`;
    lens.style.backgroundRepeat = 'no-repeat';

    function onMove(e) {
        const rect = wrap.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        let x = clientX - rect.left;
        let y = clientY - rect.top;

        // Clamp so lens never goes outside the image wrapper
        x = Math.max(LENSW / 2, Math.min(x, rect.width - LENSW / 2));
        y = Math.max(LENSH / 2, Math.min(y, rect.height - LENSH / 2));

        // Position the lens centered on cursor
        lens.style.left = (x - LENSW / 2) + 'px';
        lens.style.top = (y - LENSH / 2) + 'px';

        // Calculate background position — maps the cursor position to the zoomed image
        const bgX = (x / rect.width) * img.naturalWidth * ZOOM - LENSW / 2;
        const bgY = (y / rect.height) * img.naturalHeight * ZOOM - LENSH / 2;

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


function getCategoryName(category) {
    const categoryNames = {
        vestments: 'Vestiduras Sagradas',
        headwear: 'Yelmos de la Fe',
        accessories: 'Reliquias Menores',
        prints: 'Testimonios Gráficos'
    };
    return categoryNames[category] || category;
}

// ===================================
// CATEGORY FILTERING
// ===================================

function initializeEventListeners() {
    // Category filters
    const filterButtons = document.querySelectorAll('.filter-button');
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            state.currentCategory = button.dataset.category;
            displayProducts();
        });
    });

    // Cart modal
    document.getElementById('cartButton').addEventListener('click', openCart);
    document.getElementById('closeCartBtn').addEventListener('click', closeCart);
    document.getElementById('cartOverlay').addEventListener('click', closeCart);

    // Checkout modal
    document.getElementById('checkoutBtn').addEventListener('click', openCheckout);
    document.getElementById('closeCheckoutBtn').addEventListener('click', closeCheckout);
    document.getElementById('checkoutOverlay').addEventListener('click', closeCheckout);

    // Checkout form
    document.getElementById('checkoutForm').addEventListener('submit', handleCheckout);

    // Contact form (Footer)
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', handleContact);
    }

    // Hero "CONOCE" Button
    const conoceBtn = document.getElementById('conoceBtn');
    const heroSummaryContainer = document.getElementById('heroSummaryContainer');
    if (conoceBtn && heroSummaryContainer) {
        conoceBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const isOpen = heroSummaryContainer.classList.contains('open');
            if (isOpen) {
                heroSummaryContainer.classList.remove('open');
                conoceBtn.setAttribute('aria-expanded', 'false');
            } else {
                heroSummaryContainer.classList.add('open');
                conoceBtn.setAttribute('aria-expanded', 'true');
                // Optional: Scroll to it after a tiny delay so it can open first
                setTimeout(() => {
                    heroSummaryContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        });
    }
}

// ===================================
// CART MANAGEMENT
// ===================================

function addToCart(productId) {
    const product = state.products.find(p => p.id == productId);
    if (!product) return;

    const existingItem = state.cart.find(item => item.id == productId);

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        state.cart.push({
            ...product, // ID is already part of product
            quantity: 1
        });
    }

    updateCart();
    saveCartToStorage();

    // Visual feedback
    const cartButton = document.getElementById('cartButton');
    cartButton.style.transform = 'scale(1.2)';
    setTimeout(() => {
        cartButton.style.transform = 'scale(1)';
    }, 200);
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

    const totalItems = state.cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    cartCount.textContent = totalItems;
    cartTotal.textContent = `$${totalPrice.toFixed(2)}`;

    if (state.cart.length === 0) {
        cartItems.innerHTML = `
      <div class="empty-cart">
        <div class="empty-cart-icon">⚔️</div>
        <p>Tu carrito está vacío.</p>
      </div>
    `;
        checkoutBtn.disabled = true;
    } else {
        cartItems.innerHTML = state.cart.map(item => `
      <div class="cart-item">
        <div class="cart-item-image">
          ${item.image_url
                ? `<img src="${item.image_url}" alt="${item.name}">`
                : '🏛️'
            }
        </div>
        <div class="cart-item-details">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">$${parseFloat(item.price).toFixed(2)}</div>
          <div class="cart-item-controls">
            <button class="quantity-btn" onclick="updateQuantity('${item.id}', -1)">-</button>
            <span class="cart-item-quantity">${item.quantity}</span>
            <button class="quantity-btn" onclick="updateQuantity('${item.id}', 1)">+</button>
            <button class="remove-item-btn" onclick="removeFromCart('${item.id}')" title="Eliminar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `).join('');
        checkoutBtn.disabled = false;
    }
}

function saveCartToStorage() {
    localStorage.setItem('divinaCart', JSON.stringify(state.cart));
}

function loadCartFromStorage() {
    const savedCart = localStorage.getItem('divinaCart');
    if (savedCart) {
        state.cart = JSON.parse(savedCart);
        updateCart();
    }
}

// ===================================
// CART MODAL
// ===================================

function openCart() {
    document.getElementById('cartModal').classList.add('open');
    document.getElementById('cartOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeCart() {
    document.getElementById('cartModal').classList.remove('open');
    document.getElementById('cartOverlay').classList.remove('open');
    document.body.style.overflow = '';
}

// ===================================
// CHECKOUT MODAL
// ===================================

function openCheckout() {
    closeCart();

    const orderSummaryItems = document.getElementById('orderSummaryItems');
    const orderTotal = document.getElementById('orderTotal');

    const totalPrice = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    orderSummaryItems.innerHTML = state.cart.map(item => `
    <div class="order-item">
      <span>${item.name} x${item.quantity}</span>
      <span>$${(item.price * item.quantity).toFixed(2)}</span>
    </div>
  `).join('');

    orderTotal.textContent = `$${totalPrice.toFixed(2)}`;

    document.getElementById('checkoutModal').classList.add('open');
    document.getElementById('checkoutOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeCheckout() {
    document.getElementById('checkoutModal').classList.remove('open');
    document.getElementById('checkoutOverlay').classList.remove('open');
    document.body.style.overflow = '';

    // Reset form
    document.getElementById('checkoutForm').reset();
}

// ===================================
// CHECKOUT PROCESS
// ===================================

async function handleCheckout(e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('.submit-order-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Consumando el Pacto...';

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
        // Send to Telegram via Edge Function
        const response = await fetch(
            'https://nzwtafacdpdgulzcwntx.supabase.co/functions/v1/send-telegram-order',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(orderData)
            }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Error al enviar el pedido');
        }

        // Success!
        showSuccessMessage('TG-' + Date.now());

        // Clear cart
        state.cart = [];
        updateCart();
        saveCartToStorage();
    } catch (error) {
        console.error('Error sending order:', error);
        alert('Hubo un error al enviar tu pedido. La Providencia prueba nuestra paciencia. Por favor, intenta de nuevo.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Reintentar el Pacto';
    }
}

function showSuccessMessage(orderId) {
    const checkoutContent = document.getElementById('checkoutContent');
    checkoutContent.innerHTML = `
    <div class="success-message">
      <div class="success-icon">✓</div>
      <h3>¡Pedido Confirmado!</h3>
      <p>Gracias por tu compra. Recibirás un email de confirmación pronto.</p>
      <p>Número de pedido: <span class="order-id">${orderId}</span></p>
      <button class="cta-button" onclick="closeCheckoutAndReset()" style="margin-top: 24px;">
        Continuar Comprando
      </button>
    </div>
  `;
}

function closeCheckoutAndReset() {
    closeCheckout();

    // Reset checkout content
    setTimeout(() => {
        const checkoutContent = document.getElementById('checkoutContent');
        checkoutContent.innerHTML = `
      <form class="checkout-form" id="checkoutForm">
        <div class="order-summary">
          <h3>Resumen del Pedido</h3>
          <div id="orderSummaryItems"></div>
          <div class="order-total">
            <span>Total:</span>
            <span id="orderTotal">$0.00</span>
          </div>
        </div>
        
        <div class="form-group">
          <label for="customerName">Nombre Completo *</label>
          <input type="text" id="customerName" name="customerName" required>
        </div>
        
        <div class="form-group">
          <label for="customerEmail">Email *</label>
          <input type="email" id="customerEmail" name="customerEmail" required>
        </div>
        
        <div class="form-group">
          <label for="customerPhone">Teléfono</label>
          <input type="tel" id="customerPhone" name="customerPhone">
        </div>
        
        <div class="form-group">
          <label for="customerAddress">Dirección de Envío *</label>
          <textarea id="customerAddress" name="customerAddress" rows="3" required></textarea>
        </div>
        
        <button type="submit" class="submit-order-btn">Confirmar Pedido</button>
      </form>
    `;

        // Re-attach event listener
        document.getElementById('checkoutForm').addEventListener('submit', handleCheckout);
    }, 300);
}



// ===================================
// LOOKBOOK CAROUSEL - INFINITE SCROLL
// ===================================

let lookbookImages = [];

async function loadLookbookImages() {
    const { data, error } = await SupabaseAPI.getLookbookImages();

    if (error || !data || data.length === 0) {
        document.getElementById('lookbookCarousel').innerHTML = '<p style="text-align:center;color:#fff;">No hay imágenes disponibles</p>';
        return;
    }

    lookbookImages = data;
    renderInfiniteCarousel();
}

function renderInfiniteCarousel() {
    const container = document.getElementById('lookbookCarousel');

    // Duplicate images for infinite loop effect
    const duplicatedImages = [...lookbookImages, ...lookbookImages];

    const slidesHTML = duplicatedImages.map((img, index) => `
        <div class="carousel-slide">
            <img src="${img.image_url}" 
                 alt="Lookbook ${(index % lookbookImages.length) + 1}"
                 loading="lazy">
        </div>
    `).join('');

    container.innerHTML = `
        <div class="carousel-track">
            ${slidesHTML}
        </div>
    `;

    // Add parallax effect on mouse move
    const track = container.querySelector('.carousel-track');
    container.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentX = x / rect.width;
        const moveX = (percentX - 0.5) * 50; // Move up to 50px in either direction
        const currentTransform = getComputedStyle(track).transform;
        const matrix = new DOMMatrix(currentTransform);
        const currentX = matrix.m41;
        track.style.transform = `translateX(${currentX + moveX}px)`;
    });

    container.addEventListener('mouseleave', () => {
        // Reset to animation position
        track.style.transform = '';
    });
}

// Initialize carousel on page load
document.addEventListener('DOMContentLoaded', () => {
    loadLookbookImages();
});


// ===================================
// CONTACT FORM MANAGEMENT
// ===================================

async function handleContact(e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('.footer-submit-btn');
    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';

    const nombre = document.getElementById('contactName').value;
    const email = document.getElementById('contactEmail').value;
    const mensaje = document.getElementById('contactMessage').value;

    try {
        const { data, error } = await window.supabaseClient
            .from('mensajes_contacto')
            .insert([
                { nombre, email, mensaje }
            ]);

        if (error) throw error;

        // Success Feedback
        submitBtn.textContent = '¡Enviado!';
        submitBtn.style.backgroundColor = '#48bb78';
        e.target.reset();

        setTimeout(() => {
            submitBtn.textContent = originalBtnText;
            submitBtn.style.backgroundColor = '';
            submitBtn.disabled = false;
        }, 3000);

    } catch (error) {
        console.error('Error enviando mensaje:', error);
        alert('No se pudo enviar el mensaje. Intente de nuevo más tarde.');
        submitBtn.textContent = originalBtnText;
        submitBtn.disabled = false;
    }
}

// ===================================
// ARTICLES MANAGEMENT
// ===================================

async function loadArticles() {
    const articlesGrid = document.getElementById('articlesGrid');
    if (!articlesGrid) return;

    articlesGrid.innerHTML = '<div class="loading-spinner"><p>Invocando los Artículos...</p></div>';

    try {
        // Use supabaseClient from global scope (initialized in supabase-config.js or similar)
        const client = window.supabaseClient || window.SupabaseAPI?.client;
        if (!client) throw new Error("Supabase client not initialized");

        const { data: articles, error } = await client
            .from('articles')
            .select('*')
            .order('order_index', { ascending: true });

        if (error) throw error;

        if (!articles || articles.length === 0) {
            articlesGrid.innerHTML = '<p class="error-msg">No hay artículos disponibles por ahora.</p>';
            return;
        }

        articlesGrid.innerHTML = articles.map((article, index) => {
            const delay = index * 0.1;

            // Check if summary is long enough to need a "Read More"
            // A reasonable threshold could be 150 characters
            const isLong = article.summary && article.summary.length > 150;
            const excerpt = isLong ? article.summary.substring(0, 150) + '...' : article.summary;

            return `
                <div class="syllabus-card" style="transition-delay: ${delay}s" id="article-card-${index}">
                    <h3 class="syllabus-name">${article.title}</h3>
                    <span class="syllabus-subtitle">${article.subtitle || ''}</span>
                    
                    <div class="syllabus-desc-container">
                        <p class="syllabus-desc" id="article-desc-${index}">
                            <span class="desc-text">${isLong ? excerpt : (article.summary || '')}</span>
                            <span class="desc-full" style="display:none;">${article.summary || ''}</span>
                        </p>
                        ${isLong ? `<button class="read-more-btn" onclick="toggleArticleDesc(${index}, event)">Leer más</button>` : ''}
                    </div>
                    
                    <button class="article-open-btn" onclick="openDrivePdfModal('${article.drive_id}', '${article.title.replace(/'/g, "\\'")}')">
                        Abrir Documento
                    </button>
                </div>
             `;
        }).join('');

        // Ensure new elements are observed by scroll animation
        document.querySelectorAll('.articles-grid .syllabus-card').forEach(el => {
            if (window.scrollObserver) window.scrollObserver.observe(el);
        });

    } catch (err) {
        console.error('Error al cargar artículos:', err);
        articlesGrid.innerHTML = '<p class="error-msg">Error al invocar los artículos.</p>';
    }
}

// Toggle Article Description Length
window.toggleArticleDesc = function (index, event) {
    if (event) {
        event.stopPropagation();
    }
    const card = document.getElementById(`article-card-${index}`);
    const descContainer = document.getElementById(`article-desc-${index}`);
    const btn = card.querySelector('.read-more-btn');
    const textSpan = descContainer.querySelector('.desc-text');
    const fullSpan = descContainer.querySelector('.desc-full');

    const isExpanded = card.classList.contains('expanded');

    if (isExpanded) {
        // Collapse
        card.classList.remove('expanded');
        textSpan.style.display = 'inline';
        fullSpan.style.display = 'none';
        btn.textContent = 'Leer más';
    } else {
        // Expand
        card.classList.add('expanded');
        textSpan.style.display = 'none';
        fullSpan.style.display = 'inline';
        btn.textContent = 'Leer menos';
    }
};

// Drive PDF Viewer Modal
function openDrivePdfModal(driveId, title) {
    if (!driveId) {
        alert("Enlace de documento no disponible.");
        return;
    }
    const overlay = document.getElementById('drivePdfOverlay');
    const modal = document.getElementById('drivePdfModal');
    const titleEl = document.getElementById('drivePdfTitle');
    const iframe = document.getElementById('drivePdfIframe');

    if (!overlay || !modal) return;

    titleEl.textContent = title;
    iframe.src = `https://drive.google.com/file/d/${driveId}/preview`;

    overlay.classList.add('open');
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeDrivePdfModal() {
    const overlay = document.getElementById('drivePdfOverlay');
    const modal = document.getElementById('drivePdfModal');
    const iframe = document.getElementById('drivePdfIframe');

    if (overlay) overlay.classList.remove('open');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';

    // Clear iframe to stop loading
    setTimeout(() => {
        if (iframe) iframe.src = '';
    }, 300);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('closeDrivePdfBtn')?.addEventListener('click', closeDrivePdfModal);
    document.getElementById('drivePdfOverlay')?.addEventListener('click', closeDrivePdfModal);
});
