// ===================================================================
// DIVINA PROVIDENTIA — PIE DE PÁGINA
//
// Los textos del pie los escribe el dueño desde el panel. Aquí solo
// viven los valores de fábrica y el volcado sobre el HTML, que usan
// por igual la tienda y el editor del panel.
//
// El HTML ya trae escritos los textos de fábrica: si no hay nada
// guardado, o si falla la consulta, el pie se queda como está y el
// cliente no se encuentra un hueco en blanco.
// ===================================================================

(function (global) {
    'use strict';

    const DEFAULTS = {
        brandTitle: 'Divina Providentia',
        tagline: 'No somos una marca, somos una trinchera.',
        social: [{ label: 'Instagram', url: 'https://www.instagram.com/providentiadivina/' }],
        navTitle: 'Navegación',
        contactTitle: 'Atención',
        contactLines: ['+1 858 324 8313', 'Lun–Vie · 9:00–18:00'],
        formTitle: 'Escríbenos',
        rights: 'Todos los derechos reservados'
    };

    const MAX_SOCIAL = 8;
    const MAX_LINES = 6;

    // Un texto vacío vuelve al valor de fábrica: un encabezado en blanco
    // se lee como un fallo de la web, no como una decisión.
    function text(value, fallback, max) {
        const s = typeof value === 'string' ? value.trim() : '';
        return s ? s.slice(0, max) : fallback;
    }

    // Solo se admiten enlaces que abran una web, un correo o un teléfono.
    // Un 'javascript:' escrito en el panel se ejecutaría en la tienda de
    // todos los clientes, así que aquí se queda fuera.
    function safeUrl(url) {
        const s = String(url || '').trim();
        return /^(https?:\/\/|mailto:|tel:)/i.test(s) ? s.slice(0, 300) : '';
    }

    function normalize(footer) {
        const f = footer || {};
        const social = Array.isArray(f.social) ? f.social : DEFAULTS.social;
        const lines = Array.isArray(f.contactLines) ? f.contactLines : DEFAULTS.contactLines;

        return {
            brandTitle: text(f.brandTitle, DEFAULTS.brandTitle, 80),
            tagline: text(f.tagline, DEFAULTS.tagline, 300),

            // Las listas sí pueden quedarse vacías: quitar todas las redes
            // o todos los datos de atención es una decisión legítima.
            social: social
                .map(s => ({ label: text(s && s.label, '', 40), url: safeUrl(s && s.url) }))
                .filter(s => s.label && s.url)
                .slice(0, MAX_SOCIAL),

            navTitle: text(f.navTitle, DEFAULTS.navTitle, 40),
            contactTitle: text(f.contactTitle, DEFAULTS.contactTitle, 40),
            contactLines: lines
                .map(l => text(l, '', 120))
                .filter(Boolean)
                .slice(0, MAX_LINES),

            formTitle: text(f.formTitle, DEFAULTS.formTitle, 40),
            rights: text(f.rights, DEFAULTS.rights, 160)
        };
    }

    // 'target' permite pintar el pie de otro documento, igual que en el
    // tema: así la vista previa del panel se refresca sin tocar el panel.
    function apply(footer, target) {
        const doc = target || document;
        const f = normalize(footer);

        doc.querySelectorAll('[data-footer]').forEach(el => {
            const value = f[el.dataset.footer];
            if (typeof value === 'string') el.textContent = value;
        });

        const social = doc.querySelector('[data-footer-list="social"]');
        if (social) {
            social.innerHTML = '';
            f.social.forEach(item => {
                const a = doc.createElement('a');
                a.href = item.url;
                a.textContent = item.label;
                // Solo las webs se abren aparte; un correo o un teléfono
                // los atiende otro programa y una pestaña nueva sobra.
                if (/^https?:/i.test(item.url)) {
                    a.target = '_blank';
                    a.rel = 'noopener';
                }
                social.appendChild(a);
            });
            social.hidden = f.social.length === 0;
        }

        const lines = doc.querySelector('[data-footer-list="contactLines"]');
        if (lines) {
            lines.innerHTML = '';
            f.contactLines.forEach(line => {
                const p = doc.createElement('p');
                p.textContent = line;
                lines.appendChild(p);
            });
        }

        return f;
    }

    global.DPFooter = { DEFAULTS, normalize, apply };

})(window);
