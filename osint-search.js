const EDGE_FUNCTION_URL = 'https://nzwtafacdpdgulzcwntx.supabase.co/functions/v1/osint-search';

document.addEventListener('DOMContentLoaded', () => {
    const searchForm = document.getElementById('osintSearchForm');
    const searchInput = document.getElementById('osintSearchInput');
    const resultsGrid = document.getElementById('osintResults');

    if (!searchForm || !searchInput || !resultsGrid) {
        console.error("No se encontraron los elementos del buscador OSINT en el DOM.");
        return;
    }

    const apis = {
        gdelt: {
            name: "GDELT Project",
            class: "osint-source-gdelt",
            icon: "🌐",
            fetchData: async (query) => {
                const res = await fetch(EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, provider: 'gdelt' })
                });
                const responseData = await res.json();
                if (!res.ok) throw new Error(responseData.error || "Error en servidor GDELT");
                return responseData.data || [];
            },
            render: (items) => {
                if (!items || items.length === 0) return `<div class="osint-empty">No se encontraron artículos recientes.</div>`;
                return items.map(item => `
                    <div class="osint-item">
                        <a href="${item.url}" target="_blank" class="osint-link">${item.title}</a>
                        <span class="osint-meta">${item.domain} • ${item.seendate}</span>
                    </div>
                `).join('');
            }
        }
    };

    async function performSearch(query) {
        resultsGrid.innerHTML = '';
        resultsGrid.style.display = 'grid';

        // Crear tarjetas de carga
        Object.keys(apis).forEach(id => {
            const api = apis[id];
            const card = document.createElement('div');
            card.className = `osint-card ${api.class}`;
            card.id = `card-${id}`;
            card.innerHTML = `
                <div class="osint-card-header">
                    <span class="osint-card-icon">${api.icon}</span>
                    <h3 class="osint-card-title">${api.name}</h3>
                </div>
                <div class="osint-card-content" id="content-${id}">
                    <div class="osint-loading">Buscando...</div>
                </div>
            `;
            resultsGrid.appendChild(card);
        });

        // Ejecutar búsquedas en paralelo
        Object.keys(apis).forEach(async (id) => {
            const api = apis[id];
            const contentArea = document.getElementById(`content-${id}`);
            try {
                const data = await api.fetchData(query);
                contentArea.innerHTML = api.render(data);
            } catch (error) {
                console.error(`Error en API ${id}:`, error);
                contentArea.innerHTML = `
                    <div class="osint-error">
                        <p>Ups! ${error.message}</p>
                    </div>
                `;
            }
        });
    }

    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) performSearch(query);
    });
});
