// Mock data for the News Broadcast
document.addEventListener('DOMContentLoaded', async () => {

    // Set current date
    const dateDisplay = document.getElementById('currentDateDisplay');
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    if (dateDisplay) {
        dateDisplay.textContent = new Date().toLocaleDateString('es-ES', options);
    }

    const abstractsGrid = document.getElementById('abstractsGrid');
    const filterBtns = document.querySelectorAll('.filter-btn');

    // Reference global initialized Supabase client
    const supabaseClient = window.supabaseClient;

    // Mobile menu toggle
    const mobileMenuBtn = document.querySelector('.mobile-menu-button');
    const navLinks = document.querySelector('.nav-links');

    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });

        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
            });
        });
    }

    let newsData = [];

    // Map tags back to user-friendly names
    const getTagName = (tag) => {
        const categories = {
            'geopolitics': 'Geopolítica',
            'tradition': 'Tradición',
            'culture': 'Cultura',
            'aesthetics': 'Estética',
            'crisis': 'Crisis de la Modernidad'
        };
        return categories[tag] || 'Actualidad';
    }

    // Format timestamp with an artificial modifier to offset the free NewsData API 12-hour delay
    const timeAgo = (dateStr) => {
        let articleTime = new Date(dateStr);
        // Add 11.5 hours to the timestamp to make it look "live"
        articleTime.setHours(articleTime.getHours() + 11);
        articleTime.setMinutes(articleTime.getMinutes() + 30);

        const diff = Math.floor((new Date() - articleTime) / 1000 / 60);

        // Safely clamp if it accidentally drifts into the future
        if (diff < 0) return `Hace ${Math.floor(Math.random() * 10) + 2} minutos`;
        if (diff < 60) return `Hace ${diff} minutos`;

        const hours = Math.floor(diff / 60);
        if (hours < 24) return `Hace ${hours} horas`;
        return `Hace ${Math.floor(hours / 24)} días`;
    }

    // Load data from Supabase
    async function fetchLiveNews() {
        try {
            abstractsGrid.innerHTML = '<div class="loading-spinner"><p>Sintonizando frecuencias de información...</p></div>';

            const { data, error } = await supabaseClient
                .from('live_news')
                .select('*')
                .order('published_at', { ascending: false })
                .limit(50);

            if (error) throw error;

            if (data && data.length > 0) {
                // Map the DB data to match the UI format
                newsData = data.map(item => ({
                    id: item.id,
                    title: item.title,
                    excerpt: item.excerpt,
                    tag: item.category_tag,
                    tagName: getTagName(item.category_tag),
                    source: item.source,
                    time: timeAgo(item.published_at),
                    url: item.url,
                    continent: item.continent
                }));
                renderFeed('all');
                populateTicker();
                populateSideTickers();
            } else {
                abstractsGrid.innerHTML = '<div class="no-books"><p>No hay comunicaciones recientes en el observatorio.</p></div>';
            }
        } catch (err) {
            console.error("Error fetching news:", err);
            abstractsGrid.innerHTML = '<div class="no-books"><p>Error al conectar con el servidor central.</p></div>';
        }
    }

    // Populate the scrolling ticker with the top headlines
    function populateTicker() {
        const tickerContainer = document.querySelector('.ticker-content');
        if (!tickerContainer || newsData.length === 0) return;

        // Take top 5 news for the ticker
        const topNews = newsData.slice(0, 5);

        let tickerHTML = '';
        topNews.forEach(item => {
            // Using uppercase for tag to match design
            const tagUpper = item.tagName.toUpperCase();
            tickerHTML += `<span class="ticker-item"><span class="ticker-tag">${tagUpper}</span> <a href="${item.url}" target="_blank" style="color: inherit; text-decoration: none;">${item.title}</a></span><span class="ticker-sep">✦</span>`;
        });

        // Duplicate the content to allow seamless infinite CSS scrolling
        tickerContainer.innerHTML = tickerHTML + tickerHTML;
    }

    // Render feed
    function renderFeed(filter = 'all') {
        abstractsGrid.innerHTML = '';

        const filteredData = filter === 'all'
            ? newsData
            : newsData.filter(item => item.tag === filter);

        if (filteredData.length === 0) {
            abstractsGrid.innerHTML = `<div class="no-books"><p>No hay reportes bajo esta clasificación cultural actualmente.</p></div>`;
            return;
        }

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
                <h2 class="card-title"><a href="${item.url}" target="_blank" style="color: inherit; text-decoration: none;">${item.title}</a></h2>
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

    // --- Refresh News Logic ---
    const refreshBtn = document.getElementById('refreshNewsBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.classList.add('spin');
            refreshBtn.disabled = true;

            try {
                // Change UI state
                abstractsGrid.style.opacity = '0';
                setTimeout(() => {
                    abstractsGrid.innerHTML = '<div class="loading-spinner"><p>Solicitando nuevas intercepciones a la agencia global...</p></div>';
                    abstractsGrid.style.opacity = '1';
                }, 200);

                // Call the edge function to fetch new data
                const { data, error } = await supabaseClient.functions.invoke('fetch-live-news');

                if (error) {
                    console.error("Function invoke error:", error);
                    throw error;
                }

                console.log("Refresh response:", data);

                // Wait a tiny bit just to ensure DB is fully updated 
                await new Promise(resolve => setTimeout(resolve, 800));

                // Fetch the new data from DB
                await fetchLiveNews();

            } catch (err) {
                console.error("Failed to refresh news:", err);
                alert("Error al intentar actualizar las noticias. Verifica tu conexión o intenta más tarde.");
            } finally {
                refreshBtn.classList.remove('spin');
                refreshBtn.disabled = false;
            }
        });
    }

    // --- Broadcast Player: auto-dismiss overlay when iframe loads ---
    const broadcastOverlay = document.getElementById('broadcastOverlay');
    const broadcastIframe = document.getElementById('broadcastIframe');
    const broadcastTimeEl = document.getElementById('broadcastTime');

    // Live clock for the HUD corner
    function updateBroadcastClock() {
        if (!broadcastTimeEl) return;
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const offset = now.getTimezoneOffset();
        const sign = offset <= 0 ? '+' : '-';
        const hrs = String(Math.abs(offset / 60)).padStart(2, '0');
        broadcastTimeEl.textContent = `${hh}:${mm}:${ss} UTC${sign}${hrs}`;
    }
    updateBroadcastClock();
    setInterval(updateBroadcastClock, 1000);

    // Dismiss overlay once iframe signals it's ready
    if (broadcastIframe && broadcastOverlay) {
        broadcastIframe.classList.add('active');
        broadcastIframe.addEventListener('load', () => {
            setTimeout(() => broadcastOverlay.classList.add('hidden'), 800);
        });
    }

    // --- Side Tickers: populate left & right feeds ---
    function populateSideTickers() {
        const leftTrack = document.getElementById('leftFeedTrack');
        const rightTrack = document.getElementById('rightFeedTrack');
        if (!leftTrack || !rightTrack || newsData.length === 0) return;

        // Split data roughly in half: odd indices left, even right
        const leftItems = newsData.filter((_, i) => i % 2 === 0);
        const rightItems = newsData.filter((_, i) => i % 2 !== 0);

        function buildSideCard(item) {
            const div = document.createElement('a');
            div.className = 'side-card';
            div.href = item.url;
            div.target = '_blank';
            div.rel = 'noopener noreferrer';
            div.style.textDecoration = 'none';
            div.innerHTML = `
                <span class="side-card-tag">${item.tagName}</span>
                <p class="side-card-title">${item.title}</p>
                <span class="side-card-source">${item.source} · ${item.time}</span>
            `;
            return div;
        }

        function fillTrack(track, items) {
            track.innerHTML = '';
            // Duplicate content for seamless infinite scroll
            [...items, ...items].forEach(item => {
                track.appendChild(buildSideCard(item));
            });
            // Dynamically set animation duration based on count
            const duration = Math.max(20, items.length * 4);
            track.style.animationDuration = `${duration}s`;
        }

        fillTrack(leftTrack, leftItems);
        fillTrack(rightTrack, rightItems);
    }

    // Add CSS transition for smooth filter fading
    abstractsGrid.style.transition = 'opacity 0.2s ease-in-out';

    // Initial render
    fetchLiveNews();
}); // end DOMContentLoaded
