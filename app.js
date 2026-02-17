// ===================================
// DIVINA PROVIDENTIA - MAIN APP
// ===================================

// Stoic Quotes for Hero Section
const stoicQuotes = [
    {
        quote: "El impedimento para la acción impulsa la acción. Lo que se interpone en el camino se convierte en el camino.",
        author: "Marco Aurelio"
    },
    {
        quote: "Quien teme a la muerte nunca hará nada digno de un hombre que está vivo.",
        author: "Séneca"
    },
    {
        quote: "La riqueza no consiste en tener grandes posesiones, sino en tener pocas necesidades.",
        author: "Epicteto"
    },
    {
        quote: "Si no es correcto, no lo hagas. Si no es verdad, no lo digas.",
        author: "Marco Aurelio"
    },
    {
        quote: "La felicidad de tu vida depende de la calidad de tus pensamientos.",
        author: "Marco Aurelio"
    },
    {
        quote: "No es que tengamos poco tiempo, sino que perdemos mucho.",
        author: "Séneca"
    },
    {
        quote: "La mejor venganza es no ser como tu enemigo.",
        author: "Marco Aurelio"
    },
    {
        quote: "No pidas que las cosas sucedan como deseas, sino desea que sucedan como suceden, y serás feliz.",
        author: "Epicteto"
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
        }, 500);
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
}

// ===================================
// SCROLL ANIMATIONS
// ===================================

function initializeScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);

    // Observe philosophy cards
    document.querySelectorAll('.philosophy-card').forEach(card => {
        observer.observe(card);
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
    const filteredProducts = state.currentCategory === 'all'
        ? state.products
        : state.products.filter(p => p.category === state.currentCategory);

    if (filteredProducts.length === 0) {
        productsGrid.innerHTML = '<div class="no-products"><p>No hay productos en esta categoría.</p></div>';
        return;
    }

    productsGrid.innerHTML = filteredProducts.map(product => `
    <div class="product-card">
      <div class="product-image">
        ${product.image_url
            ? `<img src="${product.image_url}" alt="${product.name}" loading="lazy">`
            : '🏛️'
        }
      </div>
      <div class="product-info">
        <div class="product-category">${getCategoryName(product.category)}</div>
        <h3 class="product-name">${product.name}</h3>
        <p class="product-description">${product.description}</p>
        <div class="product-footer">
          <span class="product-price">$${parseFloat(product.price).toFixed(2)}</span>
          <button class="add-to-cart-btn" onclick="addToCart('${product.id}')">
            Agregar
          </button>
        </div>
      </div>
    </div>
  `).join('');

    // Animate product cards
    setTimeout(() => {
        document.querySelectorAll('.product-card').forEach((card, index) => {
            setTimeout(() => {
                card.classList.add('visible');
            }, index * 100);
        });
    }, 100);
}

function getCategoryName(category) {
    const categoryNames = {
        vestments: 'Vestimentas Sagradas',
        headwear: 'Tocados Divinos',
        accessories: 'Accesorios Místicos',
        prints: 'Grabados Filosóficos'
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
}

// ===================================
// CART MANAGEMENT
// ===================================

function addToCart(productId) {
    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    const existingItem = state.cart.find(item => item.id === productId);

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        state.cart.push({
            ...product,
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
    state.cart = state.cart.filter(item => item.id !== productId);
    updateCart();
    saveCartToStorage();
}

function updateQuantity(productId, change) {
    const item = state.cart.find(item => item.id === productId);
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
        <div class="empty-cart-icon">🛒</div>
        <p>Tu carrito está vacío</p>
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
    submitBtn.textContent = 'Procesando...';

    const formData = new FormData(e.target);
    const totalPrice = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const orderData = {
        customer_name: formData.get('customerName'),
        customer_email: formData.get('customerEmail'),
        customer_phone: formData.get('customerPhone') || '',
        items: state.cart.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity
        })),
        total: totalPrice,
        status: 'pending'
    };

    // Try to submit to Supabase
    const { data, error } = await window.SupabaseAPI.createOrder(orderData);

    if (error) {
        console.error('Error creating order:', error);
        alert('Hubo un error al procesar tu pedido. Por favor, intenta de nuevo.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirmar Pedido';
        return;
    }

    // Success!
    showSuccessMessage(data ? data[0].id : 'DEMO-' + Date.now());

    // Clear cart
    state.cart = [];
    updateCart();
    saveCartToStorage();
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

// Make functions globally available
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateQuantity = updateQuantity;
window.closeCheckoutAndReset = closeCheckoutAndReset;
