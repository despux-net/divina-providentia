// Content Management System
// Automatically loads all website text from content.json
// Edit content.json to change any text on the website without touching code!

let CONTENT = {};

// Load content from JSON file
async function loadContent() {
    try {
        const response = await fetch('content.json');
        CONTENT = await response.json();
        applyContent();
        console.log('✅ Content loaded successfully');
    } catch (error) {
        console.error('❌ Error loading content:', error);
        // Fallback to default content already in HTML
    }
}

// Apply content to the page
function applyContent() {
    // Update document title and meta
    document.title = CONTENT.site.title;
    document.documentElement.lang = CONTENT.site.lang;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.content = CONTENT.site.description;

    // Navigation
    updateText('.nav-links a[href="#inicio"]', CONTENT.navigation.links.genesis);
    updateText('.nav-links a[href="#filosofia"]', CONTENT.navigation.links.dogma);
    updateText('.nav-links a[href="#biblioteca"]', CONTENT.navigation.links.biblioteca);
    updateText('.nav-links a[href="#tienda"]', CONTENT.navigation.links.arsenal);
    updateText('.nav-links a[href="#contacto"]', CONTENT.navigation.links.alliance);

    // Hero
    updateText('.hero-title', CONTENT.hero.title);
    updateText('.hero-summary-text', CONTENT.hero.summary);
    updateText('.cta-button', CONTENT.hero.cta_button);

    // Philosophy Section
    updateText('.philosophy .section-header h2', CONTENT.philosophy.section_title);
    updateText('.philosophy .section-header p', CONTENT.philosophy.section_subtitle);

    // Philosophy Cards
    const cards = document.querySelectorAll('.philosophy-card');
    if (cards[0] && CONTENT.philosophy.cards.principle1) {
        updateText(cards[0].querySelector('h3'), CONTENT.philosophy.cards.principle1.title);
        updateText(cards[0].querySelector('p'), CONTENT.philosophy.cards.principle1.description);
    }
    if (cards[1] && CONTENT.philosophy.cards.principle2) {
        updateText(cards[1].querySelector('h3'), CONTENT.philosophy.cards.principle2.title);
        updateText(cards[1].querySelector('p'), CONTENT.philosophy.cards.principle2.description);
    }
    if (cards[2] && CONTENT.philosophy.cards.principle3) {
        updateText(cards[2].querySelector('h3'), CONTENT.philosophy.cards.principle3.title);
        updateText(cards[2].querySelector('p'), CONTENT.philosophy.cards.principle3.description);
    }
    if (cards[3] && CONTENT.philosophy.cards.principle4) {
        updateText(cards[3].querySelector('h3'), CONTENT.philosophy.cards.principle4.title);
        updateText(cards[3].querySelector('p'), CONTENT.philosophy.cards.principle4.description);
    }

    // Jung Book
    updateText('.book-title', CONTENT.philosophy.jung_book.title);
    updateText('.book-intro', CONTENT.philosophy.jung_book.intro);
    updateAttr('.book-nav-btn.prev-page', 'aria-label', CONTENT.philosophy.jung_book.prev_button_label);
    updateAttr('.book-nav-btn.next-page', 'aria-label', CONTENT.philosophy.jung_book.next_button_label);

    // Lookbook
    updateText('.lookbook-section .section-title', CONTENT.lookbook.section_title);
    updateText('.lookbook-section .loading-spinner p', CONTENT.lookbook.loading_text);
    updateAttr('.carousel-nav.prev', 'aria-label', CONTENT.lookbook.prev_button);
    updateAttr('.carousel-nav.next', 'aria-label', CONTENT.lookbook.next_button);

    // Library
    if (CONTENT.library) {
        updateText('.library .section-header h2', CONTENT.library.section_title);
        updateText('.library .section-header p', CONTENT.library.section_subtitle);
        updateText('.library .loading-spinner p', CONTENT.library.loading_text);
    }

    // Products
    updateText('.products .section-header h2', CONTENT.products.section_title);
    updateText('.products .section-header p', CONTENT.products.section_subtitle);
    updateText('.products .loading-spinner p', CONTENT.products.loading_text);

    // Category Filters
    updateText('.filter-button[data-category="all"]', CONTENT.products.filters.all);
    updateText('.filter-button[data-category="vestments"]', CONTENT.products.filters.vestments);
    updateText('.filter-button[data-category="headwear"]', CONTENT.products.filters.headwear);
    updateText('.filter-button[data-category="accessories"]', CONTENT.products.filters.accessories);
    updateText('.filter-button[data-category="prints"]', CONTENT.products.filters.prints);

    // Cart
    updateText('.cart-modal .cart-header h2', CONTENT.cart.title);
    updateText('.empty-cart p', CONTENT.cart.empty_message);
    updateText('.cart-total-label', CONTENT.cart.total_label);
    updateText('.checkout-btn', CONTENT.cart.checkout_button);
    updateAttr('#closeCartBtn', 'aria-label', CONTENT.cart.close_button_label);

    // Checkout
    updateText('.checkout-modal .checkout-header h2', CONTENT.checkout.title);
    updateText('.order-summary h3', CONTENT.checkout.summary_title);
    updateText('.order-total span:first-child', CONTENT.checkout.total_label);

    // Checkout Form
    updateText('label[for="customerName"]', CONTENT.checkout.form.name_label + ' *');
    updateAttr('#customerName', 'placeholder', CONTENT.checkout.form.name_placeholder);
    updateText('label[for="customerPhone"]', CONTENT.checkout.form.phone_label + ' *');
    updateAttr('#customerPhone', 'placeholder', CONTENT.checkout.form.phone_placeholder);
    updateText('label[for="customerMessage"]', CONTENT.checkout.form.message_label);
    updateAttr('#customerMessage', 'placeholder', CONTENT.checkout.form.message_placeholder);
    updateText('.submit-order-btn', CONTENT.checkout.form.submit_button);
    updateAttr('#closeCheckoutBtn', 'aria-label', CONTENT.checkout.close_button_label);

    // Footer
    updateText('.footer-section:nth-child(1) h3', CONTENT.footer.brand.title);
    updateText('.footer-section:nth-child(1) p', CONTENT.footer.brand.description);
    updateText('.footer-section:nth-child(2) h3', CONTENT.footer.menu_title);
    updateText('.footer-section:nth-child(3) h3', CONTENT.footer.contact.title);

    // --- MANIFESTO ---
    if (CONTENT.manifesto) {
        updateText('#manifestoTitle', CONTENT.manifesto.section_title);
        const bodyEl = document.getElementById('manifestoBody');
        if (bodyEl && CONTENT.manifesto.paragraphs) {
            bodyEl.innerHTML = CONTENT.manifesto.paragraphs
                .map(p => `<p>${formatText(p)}</p>`)
                .join('');
        }
        updateText('#manifestoClosing', CONTENT.manifesto.closing);
    }

    // --- LIFESTYLE PILLARS ---
    if (CONTENT.lifestyle) {
        updateText('#lifestyleTitle', CONTENT.lifestyle.section_title);
        updateText('#lifestyleSubtitle', CONTENT.lifestyle.section_subtitle);

        const { officium, fraternitas, ars_et_ratio } = CONTENT.lifestyle.pillars;
        if (officium) {
            updateText('#officiumIcon', officium.icon);
            updateText('#officiumName', officium.name);
            updateText('#officiumLatin', officium.latin);
            updateText('#officiumDesc', officium.description);
            updateText('#officiumTagline', officium.tagline);
        }
        if (fraternitas) {
            updateText('#fraternitasIcon', fraternitas.icon);
            updateText('#fraternitasName', fraternitas.name);
            updateText('#fraternitasLatin', fraternitas.latin);
            updateText('#fraternitasDesc', fraternitas.description);
            updateText('#fraternitasTagline', fraternitas.tagline);
        }
        if (ars_et_ratio) {
            updateText('#arsEtRatioIcon', ars_et_ratio.icon);
            updateText('#arsEtRatioName', ars_et_ratio.name);
            updateText('#arsEtRatioLatin', ars_et_ratio.latin);
            updateText('#arsEtRatioDesc', ars_et_ratio.description);
            updateText('#arsEtRatioTagline', ars_et_ratio.tagline);
        }
    }

    const contactPs = document.querySelectorAll('.footer-section:nth-child(3) p');
    if (contactPs[0]) contactPs[0].innerHTML = formatText('Email: ' + CONTENT.footer.contact.email);
    if (contactPs[1]) contactPs[1].innerHTML = formatText('Teléfono: ' + CONTENT.footer.contact.phone);
    if (contactPs[2]) contactPs[2].innerHTML = formatText(CONTENT.footer.contact.hours);

    // Footer links (same as nav)
    const footerLinks = document.querySelectorAll('.footer-links a');
    if (footerLinks[0]) footerLinks[0].innerHTML = formatText(CONTENT.navigation.links.genesis);
    if (footerLinks[1]) footerLinks[1].innerHTML = formatText(CONTENT.navigation.links.dogma);
    if (footerLinks[2]) footerLinks[2].innerHTML = formatText(CONTENT.navigation.links.arsenal);
    if (footerLinks[3]) footerLinks[3].innerHTML = formatText(CONTENT.navigation.links.alliance);

    updateText('.footer-bottom p', CONTENT.footer.copyright);
}

// Helper functions
function formatText(text) {
    if (typeof text !== 'string') return text;
    // Evita la traducción de la marca "Divina Providentia"
    return text.replace(/Divina Providentia/g, '<span translate="no" class="notranslate">Divina Providentia</span>');
}

function updateText(selector, text) {
    const element = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (element && text) {
        element.innerHTML = formatText(text);
    }
}

function updateAttr(selector, attr, value) {
    const element = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (element && value) {
        element.setAttribute(attr, value);
    }
}

// Load content when page loads
document.addEventListener('DOMContentLoaded', loadContent);
