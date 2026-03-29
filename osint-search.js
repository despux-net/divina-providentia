document.addEventListener('DOMContentLoaded', () => {
    // Select elements
    const searchForm = document.getElementById('osintSearchForm');
    const searchInput = document.getElementById('osintSearchInput');
    const spinner = document.getElementById('osintSpinner');
    const resultsContainer = document.getElementById('osintResults');

    // Supabase Edge Function URL para proxies
    const EDGE_FUNCTION_URL = 'https://nzwtafacdpdgulzcwntx.supabase.co/functions/v1/osint-search';

    // APIs Configuration
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
                        <div class="osint-item-title">${item.title}</div>
                        <div class="osint-item-meta">${item.domain} - ${item.seendate ? item.seendate.substring(0,8) : ''}</div>
                        <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="osint-item-link">Leer artículo ↗</a>
                    </div>
                `).join('');
            }
        },
        acled: {
            name: "ACLED",
            class: "osint-source-acled",
            icon: "⚠️",
            fetchData: async (query) => {
                const res = await fetch(EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, provider: 'acled' })
                });
                const responseData = await res.json();
                if (!res.ok) throw new Error(responseData.error || "Error en servidor ACLED");
                return responseData.data || [];
            },
            render: (items) => {
                if (!items || items.length === 0) return `<div class="osint-empty">Sin reportes recientes de incidentes.</div>`;
                return items.map(item => `
                    <div class="osint-item">
                        <div class="osint-item-title">${item.event_type} en ${item.location}</div>
                        <div class="osint-item-meta">${item.event_date} - Fatalidades: ${item.fatalities}</div>
                        <div class="osint-item-desc">${item.notes}</div>
                    </div>
                `).join('');
            }
        },
        sanctions: {
            name: "OpenSanctions",
            class: "osint-source-sanctions",
            icon: "⚖️",
            fetchData: async (query) => {
                const res = await fetch(EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, provider: 'opensanctions' })
                });
                const responseData = await res.json();
                if (!res.ok) throw new Error(responseData.error || "Error en servidor OpenSanctions");
                return responseData.data || [];
            },
            render: (items) => {
                if (!items || items.length === 0) return `<div class="osint-empty">No se encontraron entidades sancionadas o PEPs reportados.</div>`;
                return items.map(item => `
                    <div class="osint-item">
                        <div class="osint-item-title">${item.caption}</div>
                        <div class="osint-item-meta">${item.schema}</div>
                        <div class="osint-item-desc">Propiedades conocidas: ${Object.keys(item.properties).join(', ')}</div>
                    </div>
                `).join('');
            }
        },
        reliefweb: {
            name: "ReliefWeb (ONU)",
            class: "osint-source-relief",
            icon: "🏥",
            fetchData: async (query) => {
                const res = await fetch(EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, provider: 'reliefweb' })
                });
                const responseData = await res.json();
                if (!res.ok) throw new Error(responseData.error || "Error en servidor ReliefWeb");
                return responseData.data || [];
            },
            render: (items) => {
                if (!items || items.length === 0) return `<div class="osint-empty">No se encontraron alertas humanitarias recientes.</div>`;
                return items.map(item => `
                    <div class="osint-item">
                        <div class="osint-item-title">${item.fields && item.fields.title ? item.fields.title : 'Reporte Humanitario'}</div>
                        <a href="${item.href}" target="_blank" rel="noopener noreferrer" class="osint-item-link">Ver reporte en ReliefWeb ↗</a>
                    </div>
                `).join('');
            }
        }
    };

    if (!searchForm || !searchInput) return;

    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (!query) return;

        // Show spinner, clear old results
        spinner.style.display = 'block';
        resultsContainer.innerHTML = '';

        // Prepare the promises wrapper, ensuring individual catches so Promise.all doesn't fail early
        const fetchDataSafe = async (key) => {
            try {
                const data = await apis[key].fetchData(query);
                return { key, status: 'success', data };
            } catch (error) {
                return { key, status: 'error', error: error.message };
            }
        };

        // Execute all requests concurrently
        const apiKeys = Object.keys(apis);
        const promises = apiKeys.map(key => fetchDataSafe(key));
        
        try {
            const results = await Promise.all(promises);
            
            // Render grid
            const gridHTML = document.createElement('div');
            gridHTML.className = 'osint-results-grid';

            results.forEach(result => {
                const apiConfig = apis[result.key];
                let contentHTML = '';

                if (result.status === 'success') {
                    contentHTML = apiConfig.render(result.data);
                } else {
                    // Friendly error message for this specific card
                    contentHTML = `<div class="osint-error">
                        <strong>Ups!</strong> Hubo un problema conectando con ${apiConfig.name}.<br>
                        <small>Detalle: ${result.error || 'Servicio no disponible.'}</small>
                    </div>`;
                }

                const cardHTML = `
                    <div class="osint-card">
                        <div class="osint-card-title ${apiConfig.class}">
                            <span class="osint-icon">${apiConfig.icon}</span> ${apiConfig.name}
                        </div>
                        <div class="osint-card-content">
                            ${contentHTML}
                        </div>
                    </div>
                `;
                gridHTML.innerHTML += cardHTML;
            });

            resultsContainer.appendChild(gridHTML);
        } catch (globalError) {
            console.error("OSINT Error general:", globalError);
            resultsContainer.innerHTML = `<div class="osint-error" style="max-width: 600px; margin: 0 auto;">Ocurrió un error inesperado al procesar la búsqueda. Por favor, intenta de nuevo.</div>`;
        } finally {
            spinner.style.display = 'none';
        }
    });
});
