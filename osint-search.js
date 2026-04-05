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
        },
        gpr: {
            name: "GPR Index",
            class: "osint-source-sanctions", /* Reutilizamos un color similar de CSS existente */
            icon: "📊",
            fetchData: async (query) => {
                let gprData;
                try {
                    const res = await fetch('./gpr_data.json');
                    gprData = await res.json();
                } catch(e) {
                    console.error("No se pudo cargar GPR data", e);
                    return [];
                }
                
                const countryMap = { 
                    'argentina':'ARG', 'australia':'AUS', 'belgica':'BEL', 'brasil':'BRA', 'canada':'CAN',
                    'suiza':'CHE', 'chile':'CHL', 'china':'CHN', 'colombia':'COL', 'alemania':'DEU',
                    'españa':'ESP', 'francia':'FRA', 'reino unido':'GBR', 'inglaterra':'GBR',
                    'india':'IND', 'iran':'IRN', 'israel':'ISR', 'italia':'ITA', 'japon':'JPN', 'corea':'KOR',
                    'mexico':'MEX', 'peru':'PER', 'polonia':'POL', 'portugal':'PRT', 'rusia':'RUS', 'arabia':'SAU',
                    'turquia':'TUR', 'taiwan':'TWN', 'ucrania':'UKR', 'eeuu':'USA', 'usa':'USA', 'estados unidos':'USA',
                    'venezuela':'VEN', 'sudafrica':'ZAF'
                };
                
                let targetKey = 'Global';
                for (const [esName, code] of Object.entries(countryMap)) {
                    if (query.toLowerCase().includes(esName)) {
                        targetKey = code; break;
                    }
                }
                if (!gprData[targetKey]) targetKey = 'Global';
                
                return [{
                    title: `Geopolitical Risk Index (${targetKey})`,
                    target: targetKey,
                    months: gprData['Months'],
                    scores: gprData[targetKey],
                    latest: gprData[targetKey][gprData[targetKey].length - 1],
                    url: "https://www.matteoiacoviello.com/gpr.htm"
                }];
            },
            render: (items) => {
                if (!items || items.length === 0) return `<div class="osint-empty">Datos GPR no disponibles actualmente.</div>`;
                const item = items[0];
                
                const maxScore = Math.max(...item.scores) || 1;
                const sparklineHTML = item.scores.map((score, i) => {
                    const height = Math.max((score / maxScore) * 100, 2);
                    return `<div style="flex:1; margin:0 2px; background:#ff6b6b; height:${height}%; border-radius:3px 3px 0 0; transition:all 0.3s;" title="Mes: ${item.months[i]} | Score: ${score.toFixed(2)}"></div>`;
                }).join('');
                
                return `
                    <div class="osint-item">
                        <div class="osint-sanction-tag" style="background:#334155; color: white; display:inline-block; padding:2px 6px; border-radius:4px; font-size:0.7em;">RIESGO GEOPOLÍTICO</div>
                        <div style="margin-top:0.5rem">
                            <a href="${item.url}" target="_blank" class="osint-link" style="color:var(--text-color); font-size:1.2em; font-weight:bold">${item.title}</a>
                        </div>
                        
                        <div style="font-size:3rem; font-weight:800; margin:1rem 0 0.5rem 0; color:#ff6b6b; line-height:1">
                            ${item.latest.toFixed(1)}
                        </div>
                        
                        <div style="height:80px; display:flex; align-items:flex-end; border-bottom:2px solid #555; padding-bottom:5px; margin-top:20px;">
                            ${sparklineHTML}
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:#888; margin-top:5px; font-weight:bold;">
                            <span>${item.months[0]}</span>
                            <span>Últimos 12 meses</span>
                            <span>${item.months[item.months.length-1]}</span>
                        </div>

                        <p class="osint-item-desc" style="margin-top:1.5rem;">Índice medido para ${item.target} (Desarrollado por Matteo Iacoviello & Dario Caldara).</p>
                    </div>
                `;
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
