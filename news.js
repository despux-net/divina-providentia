// Mock data for the News Broadcast
const newsData = [
    {
        id: 1,
        title: "La Caída de los Relatos: El fracaso del progresismo institucional",
        excerpt: "Las encuestas recientes en el corazón de Europa revelan un rechazo masivo de las nuevas generaciones hacia las doctrinas del deconstructivismo social. Buscan certezas donde el estado posmoderno solo ofrece relatividad.",
        tag: "crisis",
        tagName: "Crisis de la Modernidad",
        source: "Observatorio Geopolítico Central",
        time: "Hace 2 horas"
    },
    {
        id: 2,
        title: "El Renacimiento de la Arquitectura Clásica en Metrópolis Modernas",
        excerpt: "Varios ayuntamientos han comenzado a rechazar proyectos de arquitectura brutalista en favor de estilos neo-clásicos, argumentando que el entorno urbano moldea la salud espiritual de sus ciudadanos.",
        tag: "aesthetics",
        tagName: "Estética",
        source: "Instituto de Belleza Objetiva",
        time: "Hace 5 horas"
    },
    {
        id: 3,
        title: "Nueva Configuración de Poder: Eurasia busca hegemonía económica",
        excerpt: "El eje oriental consolida su sistema financiero paralelo, marcando lo que muchos historiadores ya catalogan como el fin definitivo de la hegemonía atlantista unipolar y el inicio de un nuevo orden global.",
        tag: "geopolitics",
        tagName: "Geopolítica",
        source: "Strategic Defense Journal",
        time: "Hace 8 horas"
    },
    {
        id: 4,
        title: "Retorno a lo Sagrado: Liturgias antiguas atraen a la juventud",
        excerpt: "Ajenos al rito moderno, miles de jóvenes acuden cada domingo a misas en latín y ritos ancestrales buscando el sentido de misterio, verticalidad y trascendencia que el mundo hiperconectado les ha negado.",
        tag: "tradition",
        tagName: "Tradición",
        source: "Chronica Sacra",
        time: "Hace 11 horas"
    },
    {
        id: 5,
        title: "El fin de la familia extendida: Consecuencias del individualismo",
        excerpt: "Un nuevo ensayo sociológico demuestra cómo la disolución de las estructuras familiares tradicionales ha generado una epidemia de soledad y dependencia estatal sin precedentes en la historia de occidente.",
        tag: "culture",
        tagName: "Cultura",
        source: "Social Order Review",
        time: "Hace 14 horas"
    },
    {
        id: 6,
        title: "Defensa Tecnológica: Soberanía digital como nuevo frente militar",
        excerpt: "Las naciones conservadoras están invirtiendo cifras récord en infraestructuras de servidores locales e inteligencias artificiales alineadas, reconociendo que el control de los datos es la verdadera frontera defensiva del siglo XXI.",
        tag: "geopolitics",
        tagName: "Geopolítica",
        source: "Tech-Sovereignty Council",
        time: "Hace 18 horas"
    },
    {
        id: 7,
        title: "El Redescubrimiento de los Clásicos en la Educación Privada",
        excerpt: "Nuevos modelos educativos (Classical Education) están reemplazando los paradigmas constructivistas. Se vuelve a la enseñanza de retórica, lógica, latín y la lectura de los Grandes Libros de Occidente.",
        tag: "culture",
        tagName: "Cultura",
        source: "Academia Perennis",
        time: "Hace 22 horas"
    },
    {
        id: 8,
        title: "Filosofía Perenne vs. Transhumanismo",
        excerpt: "El debate bioético de la década se centra en la naturaleza humana. Mientras Silicon Valley promueve la superación biológica, los focos de resistencia intelectual abogan por la sacralidad inviolable de la condición humana natural.",
        tag: "crisis",
        tagName: "Crisis de la Modernidad",
        source: "Bioethics Vanguard",
        time: "Ayer"
    }
];

document.addEventListener('DOMContentLoaded', () => {

    // Set current date
    const dateDisplay = document.getElementById('currentDateDisplay');
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateDisplay.textContent = new Date().toLocaleDateString('es-ES', options);

    const abstractsGrid = document.getElementById('abstractsGrid');
    const filterBtns = document.querySelectorAll('.filter-btn');

    // Render feed
    function renderFeed(filter = 'all') {
        abstractsGrid.innerHTML = '';

        const filteredData = filter === 'all'
            ? newsData
            : newsData.filter(item => item.tag === filter);

        filteredData.forEach(item => {
            const card = document.createElement('article');
            card.className = 'news-card';

            // Validate excerpt length logic (max 280)
            const excerptDisplay = item.excerpt.length > 280
                ? item.excerpt.substring(0, 277) + '...'
                : item.excerpt;

            card.innerHTML = `
                <div class="card-meta">
                    <span class="card-tag">${item.tagName}</span>
                    <span class="card-time">${item.time}</span>
                </div>
                <h2 class="card-title">${item.title}</h2>
                <p class="card-excerpt">${excerptDisplay}</p>
                <div class="card-footer">
                    <span class="card-source">FUENTE: ${item.source}</span>
                </div>
            `;
            abstractsGrid.appendChild(card);
        });
    }

    // Initialize event listeners for filters
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove active class from all
            filterBtns.forEach(b => b.classList.remove('active'));
            // Add to clicked
            e.target.classList.add('active');

            const filterValue = e.target.getAttribute('data-filter');

            // Add subtle animation out-in
            abstractsGrid.style.opacity = '0';
            setTimeout(() => {
                renderFeed(filterValue);
                abstractsGrid.style.opacity = '1';
            }, 200);
        });
    });

    // Add CSS transition for smooth filter fading
    abstractsGrid.style.transition = 'opacity 0.2s ease-in-out';

    // Initial render
    renderFeed();
});
