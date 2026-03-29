const EDGE_FUNCTION_URL = 'https://nzwtafacdpdgulzcwntx.supabase.co/functions/v1/osint-search';

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('osint-query');
    const searchBtn = document.getElementById('osint-btn');
    const resultsGrid = document.getElementById('osint-results');

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
        },
        wikidata: {
            name: "Wiki Intel",
            class: "osint-source-acled", // Reutilizamos clase de color o la cambiamos
            icon: "🏛️",
            fetchData: async (query) => {
                const res = await fetch(EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, provider: 'wikidata_intel' })
                });
                const responseData = await res.json();
                if (!res.ok) throw new Error(responseData.error || "Error en Wikidata Intel");
                return responseData.data || [];
            },
            render: (items) => {
                if (!items || items.length === 0) return `<div class="osint-empty">No se encontraron perfiles relevantes.</div>`;
                return items.map(item => `
                    <div class="osint-item">
                        <a href="${item.url}" target="_blank" class="osint-link">${item.label}</a>
                        <p class="osint-item-desc">${item.description}</p>
                    </div>
                `).join('');
            }
        },
        sanctions: {
            name: "Sanctions Check",
            class: "osint-source-sanctions",
            icon: "⚖️",
            fetchData: async (query) => {
                const res = await fetch(EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, provider: 'wikidata_sanctions' })
                });
                const responseData = await res.json();
                if (!res.ok) throw new Error(responseData.error || "Error en Sanctions Check");
                return responseData.data || [];
            },
            render: (items) => {
                if (!items || items.length === 0) return `<div class="osint-empty">No se detectaron entidades sancionadas.</div>`;
                return items.map(item => `
                    <div class="osint-item">
                        <div class="osint-sanction-tag">⚠️ POTENCIAL PEP/SANCIÓN</div>
                        <span class="osint-link" style="color:var(--text-color)">${item.label}</span>
                        <p class="osint-item-desc">${item.description}</p>
                    </div>
                `).join('');
            }
        },
        hazards: {
            name: "Global Monitoring",
            class: "osint-source-reliefweb",
            icon: "🔥",
            fetchData: async (query) => {
                const res = await fetch(EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, provider: 'hazards' })
                });
                const responseData = await res.json();
                if (!res.ok) throw new Error(responseData.error || "Error en Global Monitoring");
                return responseData.data || [];
            },
            render: (items) => {
                if (!items || items.length === 0) return `<div class="osint-empty">No se detectaron riesgos activos.</div>`;
                return items.map(item => `
                    <div class="osint-item">
                        <div class="osint-hazard-badge">ALERTA NASA</div>
                        <span class="osint-link" style="color:var(--text-color)">${item.title}</span>
                        <span class="osint-meta">${item.categories?.[0]?.title || 'Incidente'} • ${new Date(item.geometry?.[0]?.date).toLocaleDateString()}</span>
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

    searchBtn.addEventListener('click', () => {
        const query = searchInput.value.trim();
        if (query) performSearch(query);
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = searchInput.value.trim();
            if (query) performSearch(query);
        }
    });
});
