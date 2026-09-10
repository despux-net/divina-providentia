// ===================================================================
// DIVINA PROVIDENTIA — FICHA DE PRODUCTO
//
// Se apoya en app.js, que ya trae carrito, checkout, navegación y tema.
// Aquí solo vive lo propio de la ficha: galería, selectores y
// relacionados. app.js deja state.products vacío en esta página porque
// no encuentra la rejilla de la tienda, así que lo llenamos nosotros.
// ===================================================================

const pdp = {
    product: null,
    imageIndex: 0,
    size: null,
    color: null
};

function pdpParamId() {
    return new URLSearchParams(location.search).get('id');
}

function pdpFail(message) {
    document.getElementById('pdpStatus').innerHTML = `
        <p>${escapeHtml(message)}</p>
        <p><a class="hero-link" href="index.html#tienda">Volver a la tienda</a></p>`;
}

async function initProductPage() {
    const id = pdpParamId();
    if (!id) return pdpFail('No se ha indicado ningún producto.');

    const { data, error } = await window.SupabaseAPI.getProducts();
    if (error || !data) return pdpFail('No se pudo cargar el catálogo.');

    // Lo necesita addToCart() de app.js para encontrar el artículo.
    state.products = data;

    const product = data.find(p => String(p.id) === String(id));
    if (!product) return pdpFail('Este producto ya no está disponible.');

    pdp.product = product;
    pdp.imageIndex = 0;

    // Con una sola talla no tiene sentido hacer elegir: se preselecciona
    // si además tiene existencias.
    const sizes = productSizes(product);
    pdp.size = sizes.length === 1 && stockOf(product, sizes[0]) > 0
        ? sizes[0]
        : (sizes.length ? null : SINGLE_SIZE);

    const colors = productColors(product);
    pdp.color = colors.length ? colors[0].name : null;

    document.title = `${product.name} | Divina Providentia`;
    renderPDP();
    renderRelated();
}

function renderPDP() {
    const product = pdp.product;
    const imgs = productImages(product);
    const sizes = productSizes(product);
    const colors = productColors(product);
    const canBuy = isPurchasable(product);

    document.getElementById('pdp').innerHTML = `
        <nav class="breadcrumbs pdp-crumbs" aria-label="Migas de pan">
            <a href="index.html">Inicio</a><span aria-hidden="true">/</span>
            <a href="index.html#tienda">Tienda</a><span aria-hidden="true">/</span>
            <span aria-current="page">${escapeHtml(product.name)}</span>
        </nav>

        <div class="pdp-body">
            <div class="pdp-gallery">
                <div class="pdp-main">
                    <img id="pdpMainImg" src="${escapeHtml(imgs[0] || '')}" alt="${escapeHtml(product.name)}">
                    ${!canBuy ? '<div class="product-status-badge">Agotado</div>' : ''}
                </div>
                ${imgs.length > 1 ? `
                <div class="pdp-thumbs" role="tablist" aria-label="Fotos del producto">
                    ${imgs.map((src, i) => `
                        <button class="pdp-thumb${i === 0 ? ' is-active' : ''}" data-img="${i}"
                                role="tab" aria-selected="${i === 0}"
                                aria-label="Ver foto ${i + 1}">
                            <img src="${escapeHtml(src)}" alt="" loading="lazy">
                        </button>`).join('')}
                </div>` : ''}
            </div>

            <div class="pdp-info">
                <p class="pdp-cat">${escapeHtml(getCategoryName(product.category))}</p>
                <h1 class="pdp-name">${escapeHtml(product.name)}</h1>
                <p class="pdp-price">$${parseFloat(product.price).toFixed(2)}</p>

                ${colors.length ? `
                <div class="pdp-block">
                    <p class="pdp-label">Color <span class="pdp-chosen" id="pdpColorName">${escapeHtml(colors[0].name)}</span></p>
                    <div class="pdp-colors">
                        ${colors.map((c, i) => `
                            <button class="pdp-color${i === 0 ? ' is-active' : ''}" data-color="${escapeHtml(c.name)}"
                                    style="background:${escapeHtml(c.hex || '#fff')}"
                                    aria-label="${escapeHtml(c.name)}" title="${escapeHtml(c.name)}"></button>`).join('')}
                    </div>
                </div>` : ''}

                ${sizes.length ? `
                <div class="pdp-block">
                    <p class="pdp-label">Talla</p>
                    <div class="pdp-sizes">
                        ${sizes.map(size => {
        const left = stockOf(product, size);
        const out = left <= 0;
        return `<button class="pdp-size${out ? ' out' : ''}${pdp.size === size ? ' is-active' : ''}"
                                        data-size="${escapeHtml(size)}" ${out ? 'disabled' : ''}
                                        title="${out ? 'Agotada' : left + ' disponibles'}">${escapeHtml(size)}</button>`;
    }).join('')}
                    </div>
                    <p class="pdp-hint" id="pdpSizeHint"></p>
                </div>` : ''}

                <button class="pdp-add${!canBuy ? ' disabled' : ''}" id="pdpAdd" ${!canBuy ? 'disabled' : ''}>
                    ${canBuy ? 'Añadir al carrito' : 'Agotado'}
                </button>

                ${product.description ? `
                <div class="pdp-block pdp-text">
                    <p class="pdp-label">Descripción</p>
                    <p>${escapeHtml(product.description)}</p>
                </div>` : ''}

                ${product.material ? `
                <details class="pdp-details">
                    <summary>Materiales</summary>
                    <p>${escapeHtml(product.material)}</p>
                </details>` : ''}

                ${product.care ? `
                <details class="pdp-details">
                    <summary>Cuidado</summary>
                    <p>${escapeHtml(product.care)}</p>
                </details>` : ''}
            </div>
        </div>`;

    bindPDP();
}

function bindPDP() {
    const main = document.getElementById('pdpMainImg');
    const imgs = productImages(pdp.product);

    document.querySelectorAll('.pdp-thumb').forEach(btn => {
        btn.addEventListener('click', () => {
            pdp.imageIndex = Number(btn.dataset.img);
            main.src = imgs[pdp.imageIndex];
            document.querySelectorAll('.pdp-thumb').forEach(b => {
                const on = b === btn;
                b.classList.toggle('is-active', on);
                b.setAttribute('aria-selected', String(on));
            });
        });
    });

    document.querySelectorAll('.pdp-color').forEach(btn => {
        btn.addEventListener('click', () => {
            pdp.color = btn.dataset.color;
            document.getElementById('pdpColorName').textContent = pdp.color;
            document.querySelectorAll('.pdp-color').forEach(b => b.classList.toggle('is-active', b === btn));
        });
    });

    const hint = document.getElementById('pdpSizeHint');
    document.querySelectorAll('.pdp-size').forEach(btn => {
        btn.addEventListener('click', () => {
            pdp.size = btn.dataset.size;
            document.querySelectorAll('.pdp-size').forEach(b => b.classList.toggle('is-active', b === btn));
            if (hint) hint.textContent = `Quedan ${stockOf(pdp.product, pdp.size)} unidades`;
        });
    });

    const add = document.getElementById('pdpAdd');
    if (add && !add.disabled) {
        add.addEventListener('click', () => {
            if (!pdp.size) {
                if (hint) hint.textContent = 'Elige una talla para continuar';
                document.querySelector('.pdp-sizes')?.classList.add('needs-choice');
                return;
            }
            addToCart(pdp.product.id, pdp.size);
        });
    }
}

// Relacionados: misma categoría primero y, si no llegan a cuatro, se
// completa con el resto del catálogo. Con pocas referencias es mejor
// enseñar algo que dejar el hueco vacío.
function renderRelated() {
    const grid = document.getElementById('relatedGrid');
    const section = document.getElementById('related');
    if (!grid || !section) return;

    const others = state.products.filter(p =>
        String(p.id) !== String(pdp.product.id) && productImages(p).length > 0);

    const sameCat = others.filter(p => p.category === pdp.product.category);
    const rest = others.filter(p => p.category !== pdp.product.category);
    const picks = sameCat.concat(rest).slice(0, 4);

    if (!picks.length) return;

    section.hidden = false;
    grid.innerHTML = picks.map(p => {
        const imgs = productImages(p);
        const colors = productColors(p);
        const meta = colors.length > 1
            ? `${colors.length} colores`
            : (productSizes(p).length > 1 ? `${productSizes(p).length} tallas` : '');

        return `
        <a class="product-card" href="producto.html?id=${encodeURIComponent(p.id)}">
          <div class="product-image-container">
            <img src="${escapeHtml(imgs[0])}" alt="${escapeHtml(p.name)}" loading="lazy" class="product-image-bg">
            ${imgs[1] ? `<img src="${escapeHtml(imgs[1])}" alt="" aria-hidden="true" loading="lazy" class="product-image-bg product-image-alt">` : ''}
            ${!isPurchasable(p) ? '<div class="product-status-badge">Agotado</div>' : ''}
          </div>
          <div class="product-info">
            <h3 class="product-name">${escapeHtml(p.name)}</h3>
            ${meta ? `<p class="product-meta-line">${meta}</p>` : ''}
            <div class="product-footer">
              <span class="product-price">$${parseFloat(p.price).toFixed(2)}</span>
            </div>
          </div>
        </a>`;
    }).join('');
}

document.addEventListener('DOMContentLoaded', initProductPage);
