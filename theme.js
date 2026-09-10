// ===================================================================
// DIVINA PROVIDENTIA — TEMA
//
// Traduce los ajustes que el dueño elige en el panel a variables CSS.
// Lo usan la tienda y la vista previa del panel, de modo que lo que se
// ve al configurar es exactamente lo que verá el cliente.
//
// Nada de esto toca la hoja de estilos: si el tema está vacío o falla
// al leerse, styles.css conserva sus valores de fábrica.
// ===================================================================

(function (global) {
    'use strict';

    // Catálogo de tipografías. 'google' es el nombre de la familia en
    // Google Fonts; las que no lo llevan ya están en el sistema y no
    // requieren descargar nada.
    const FONTS = {
        helvetica: {
            label: 'Helvetica / System',
            stack: '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif'
        },
        georgia: {
            label: 'Georgia',
            stack: 'Georgia, "Times New Roman", serif'
        },
        inter: { label: 'Inter', google: 'Inter', weights: '300;400;500;600;700', stack: '"Inter", sans-serif' },
        archivo: { label: 'Archivo', google: 'Archivo', weights: '400;500;600;700', stack: '"Archivo", sans-serif' },
        'archivo-black': { label: 'Archivo Black', google: 'Archivo Black', weights: '400', stack: '"Archivo Black", sans-serif' },
        'space-grotesk': { label: 'Space Grotesk', google: 'Space Grotesk', weights: '400;500;600;700', stack: '"Space Grotesk", sans-serif' },
        'dm-sans': { label: 'DM Sans', google: 'DM Sans', weights: '400;500;700', stack: '"DM Sans", sans-serif' },
        oswald: { label: 'Oswald', google: 'Oswald', weights: '300;400;500;600', stack: '"Oswald", sans-serif' },
        'bebas-neue': { label: 'Bebas Neue', google: 'Bebas Neue', weights: '400', stack: '"Bebas Neue", sans-serif' },
        anton: { label: 'Anton', google: 'Anton', weights: '400', stack: '"Anton", sans-serif' },
        'playfair-display': { label: 'Playfair Display', google: 'Playfair Display', weights: '400;500;600;700', stack: '"Playfair Display", serif' },
        cormorant: { label: 'Cormorant Garamond', google: 'Cormorant Garamond', weights: '300;400;500;600', stack: '"Cormorant Garamond", serif' },
        'libre-baskerville': { label: 'Libre Baskerville', google: 'Libre Baskerville', weights: '400;700', stack: '"Libre Baskerville", serif' },
        cinzel: { label: 'Cinzel', google: 'Cinzel', weights: '400;700', stack: '"Cinzel", serif' },
        'courier-prime': { label: 'Courier Prime', google: 'Courier Prime', weights: '400;700', stack: '"Courier Prime", monospace' },
        'jetbrains-mono': { label: 'JetBrains Mono', google: 'JetBrains Mono', weights: '400;500;700', stack: '"JetBrains Mono", monospace' }
    };

    // Valores de fábrica. Coinciden con los de :root en styles.css.
    const DEFAULTS = {
        fontBody: 'helvetica',
        fontHead: 'helvetica',
        weightHead: 600,

        fsBody: 13,
        navH: 52,

        heroTitleScale: 1,
        sectionTitleScale: 1,
        heroAlign: 'center',
        heroMinH: 100,
        heroOverlay: 0.32,

        track: 0.09,
        trackWide: 0.16,

        colBg: '#ffffff',
        colText: '#000000',
        colGrey: '#767676',
        colLine: '#e4e4e4',
        colSoft: '#f4f4f4'
    };

    function clamp(n, min, max, fallback) {
        const v = Number(n);
        return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
    }

    // Rellena los huecos con los valores de fábrica y recorta lo que
    // venga fuera de rango, para que un ajuste corrupto no rompa la web.
    function normalize(theme) {
        const t = Object.assign({}, DEFAULTS, theme || {});
        return {
            fontBody: FONTS[t.fontBody] ? t.fontBody : DEFAULTS.fontBody,
            fontHead: FONTS[t.fontHead] ? t.fontHead : DEFAULTS.fontHead,
            weightHead: clamp(t.weightHead, 300, 900, DEFAULTS.weightHead),

            fsBody: clamp(t.fsBody, 11, 20, DEFAULTS.fsBody),
            navH: clamp(t.navH, 40, 120, DEFAULTS.navH),

            heroTitleScale: clamp(t.heroTitleScale, 0.4, 2, DEFAULTS.heroTitleScale),
            sectionTitleScale: clamp(t.sectionTitleScale, 0.6, 3, DEFAULTS.sectionTitleScale),
            heroAlign: ['left', 'center', 'right'].includes(t.heroAlign) ? t.heroAlign : DEFAULTS.heroAlign,
            heroMinH: clamp(t.heroMinH, 40, 100, DEFAULTS.heroMinH),
            heroOverlay: clamp(t.heroOverlay, 0, 0.85, DEFAULTS.heroOverlay),

            track: clamp(t.track, 0, 0.4, DEFAULTS.track),
            trackWide: clamp(t.trackWide, 0, 0.5, DEFAULTS.trackWide),

            colBg: t.colBg || DEFAULTS.colBg,
            colText: t.colText || DEFAULTS.colText,
            colGrey: t.colGrey || DEFAULTS.colGrey,
            colLine: t.colLine || DEFAULTS.colLine,
            colSoft: t.colSoft || DEFAULTS.colSoft
        };
    }

    // Descarga de Google solo las familias que se estén usando, y solo
    // una vez por familia.
    function ensureFont(key, doc) {
        const font = FONTS[key];
        if (!font || !font.google) return;

        const id = 'dp-font-' + key;
        if (doc.getElementById(id)) return;

        const link = doc.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=' +
            font.google.replace(/ /g, '+') +
            (font.weights ? ':wght@' + font.weights : '') +
            '&display=swap';
        doc.head.appendChild(link);
    }

    // 'target' permite aplicar el tema a otro documento — así la vista
    // previa del panel se pinta sin tocar el propio panel.
    function apply(theme, target) {
        const doc = target || document;
        const t = normalize(theme);
        const root = doc.documentElement;

        ensureFont(t.fontBody, doc);
        ensureFont(t.fontHead, doc);

        const set = (name, value) => root.style.setProperty(name, value);

        set('--font-body', FONTS[t.fontBody].stack);
        set('--font-head', FONTS[t.fontHead].stack);
        set('--weight-head', String(t.weightHead));

        // Los tamaños pequeños se derivan del cuerpo para que la escala
        // tipográfica siga siendo coherente al agrandar la letra.
        set('--fs-body', t.fsBody + 'px');
        set('--fs-small', (t.fsBody - 1) + 'px');
        set('--fs-nano', (t.fsBody - 2) + 'px');
        set('--fs-micro', (t.fsBody - 3) + 'px');

        set('--nav-h', t.navH + 'px');

        // Se conserva el clamp para que siga siendo responsive: la
        // escala multiplica los tres extremos, no fija un tamaño.
        const s = t.heroTitleScale;
        set('--hero-title-size',
            `clamp(${(2.6 * s).toFixed(2)}rem, ${(11 * s).toFixed(2)}vw, ${(9 * s).toFixed(2)}rem)`);

        const ss = t.sectionTitleScale;
        set('--section-title-size',
            `clamp(${(1.1 * ss).toFixed(2)}rem, ${(2.6 * ss).toFixed(2)}vw, ${(1.6 * ss).toFixed(2)}rem)`);

        set('--hero-align', t.heroAlign);
        set('--hero-justify',
            t.heroAlign === 'left' ? 'flex-start' : t.heroAlign === 'right' ? 'flex-end' : 'center');
        set('--hero-min-h', t.heroMinH + 'svh');
        set('--hero-overlay', String(t.heroOverlay));

        set('--track', t.track + 'em');
        set('--track-wide', t.trackWide + 'em');

        set('--white', t.colBg);
        set('--black', t.colText);
        set('--grey', t.colGrey);
        set('--grey-light', t.colLine);
        set('--grey-bg', t.colSoft);

        return t;
    }

    global.DPTheme = { FONTS, DEFAULTS, normalize, apply };

})(window);
