// ===================================
// DIVINA PROVIDENTIA - MAIN APP
// ===================================

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
    initializeApp();
});

async function initializeApp() {
    // Initialize hero quote rotation
    displayQuote();
    setInterval(rotateQuote, 8000);

    // Initialize scroll animations
    initializeScrollAnimations();

    // Initialize navbar scroll effect
    initializeNavbar();

    // Load products from Supabase
    await loadProducts();

    // Initialize event listeners
    initializeEventListeners();

    // Load cart from localStorage
    loadCartFromStorage();
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
        '.lifestyle-card',
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
            name: 'Camiseta Virtus',
            description: 'Diseño minimalista con el símbolo de la virtud estoica.',
            price: 29.99,
            category: 'vestments',
            image: null,
            stock: 10
        },
        {
            id: '2',
            name: 'Sudadera Sapientia',
            description: 'Comodidad y sabiduría en cada fibra.',
            price: 49.99,
            category: 'vestments',
            image: null,
            stock: 8
        },
        {
            id: '3',
            name: 'Gorra Fortitudo',
            description: 'Protege tu mente con fortaleza.',
            price: 24.99,
            category: 'headwear',
            image: null,
            stock: 15
        },
        {
            id: '4',
            name: 'Bolsa Temperantia',
            description: 'Lleva lo esencial con moderación.',
            price: 34.99,
            category: 'accessories',
            image: null,
            stock: 12
        },
        {
            id: '5',
            name: 'Pin Marco Aurelio',
            description: 'Pequeño recordatorio de grandes enseñanzas.',
            price: 9.99,
            category: 'accessories',
            image: null,
            stock: 50
        },
        {
            id: '6',
            name: 'Lámina Memento Mori',
            description: 'Arte filosófico para tu espacio.',
            price: 19.99,
            category: 'prints',
            image: null,
            stock: 20
        },
        {
            id: '7',
            name: 'Camiseta Amor Fati',
            description: 'Ama tu destino, vístelo con orgullo.',
            price: 29.99,
            category: 'vestments',
            image: null,
            stock: 10
        },
        {
            id: '8',
            name: 'Gorra Stoic',
            description: 'Estilo atemporal para mentes filosóficas.',
            price: 24.99,
            category: 'headwear',
            image: null,
            stock: 18
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
    <div class="product-card ${!isAvailable ? 'sold-out' : ''}">
      <div class="product-image-container">
        <img src="${product.image_url}" alt="${product.name}" loading="lazy" class="product-image-bg">
        <div class="product-image-overlay"></div>
        ${!isAvailable ? '<div class="product-status-badge">AGOTADO</div>' : ''}
        <div class="product-info-overlay">
          <div class="product-category">${getCategoryName(product.category)}</div>
          <h3 class="product-name">${product.name}</h3>
        </div>
      </div>
      <div class="product-info">
        <p class="product-description">${product.description}</p>
        <div class="product-footer">
          <span class="product-price">$${parseFloat(product.price).toFixed(2)}</span>
          <button class="add-to-cart-btn ${!isAvailable ? 'disabled' : ''}" 
                  onclick="${isAvailable ? `addToCart('${product.id}')` : ''}" 
                  ${!isAvailable ? 'disabled' : ''}>
            ${isAvailable ? 'Agregar' : 'Agotado'}
          </button>
        </div>
      </div>
    </div>
  `}).join('');

    // Observe product cards for scroll animation
    document.querySelectorAll('.product-card').forEach((card, index) => {
        // We can add a staggered transition delay based on index for the grid layout
        card.style.transitionDelay = `${(index % 4) * 0.1}s`;
        scrollObserver.observe(card);
    });
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
        <p>Tu arsenal está desprovisto.</p>
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
