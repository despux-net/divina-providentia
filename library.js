// Library System for PDF Books
// Securely loads and displays PDF books with 15-page limit

const LIBRARY_CONFIG = {
    maxPages: 15,
    pdfWorkerSrc: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
};

let currentBook = null;
let currentPage = 1;
let pdfDoc = null;
let pageRendering = false;
let pageNumPending = null;

// Initialize PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = LIBRARY_CONFIG.pdfWorkerSrc;

// Load books from content.json and render grid
// Load books from Supabase Database
async function loadLibraryBooks() {
    const booksGrid = document.getElementById('booksGrid');
    if (!booksGrid) return;

    try {
        booksGrid.innerHTML = '<div class="loading-spinner"><p>Cargando biblioteca...</p></div>';

        // Check validation status from window or fetch it
        let isValidated = window.isUserValidated || false;

        // If auth isn't resolved yet, wait a bit or try to get session
        if (!isValidated && window.supabaseClient) {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session) {
                const { data: profile } = await supabaseClient
                    .from('profiles')
                    .select('is_validated')
                    .eq('id', session.user.id)
                    .single();
                isValidated = profile?.is_validated || false;
            }
        }

        // Fetch from Supabase "books" table
        const { data: books, error } = await supabaseClient
            .from('books')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!books || books.length === 0) {
            booksGrid.innerHTML = '<p class="no-books">No hay libros disponibles en este momento.</p>';
            return;
        }

        booksGrid.innerHTML = books.map(book => {
            const downloadBtn = isValidated ? `
                <button class="download-book-btn" onclick="downloadBook('${book.id}', '${book.title.replace(/'/g, "\\'")}')">
                    📥 Descargar Completo
                </button>
            ` : '';

            const readBtnText = isValidated
                ? "📖 Leer Completo"
                : `📖 Leer Primeras ${book.max_pages_preview || LIBRARY_CONFIG.maxPages} Páginas`;

            return `
            <div class="book-list-item" data-book-id="${book.id}">
                <div class="book-item-content">
                    <span class="book-item-icon">📜</span>
                    <span class="book-list-title">${book.title}</span>
                    <span class="book-list-author">- ${book.author}</span>
                </div>
                
                <div class="book-hover-card">
                    <button class="mobile-close-btn" onclick="event.stopPropagation(); this.closest('.book-list-item').classList.remove('active');">&times;</button>
                    <div class="book-cover" style="height: 200px;">
                        <img src="${book.cover_url || 'LOGOV4.png'}" alt="${book.title}" onerror="this.src='LOGOV4.png'">
                    </div>
                    <div class="book-info">
                        <h3 class="book-title" style="font-size: 1.2rem;">${book.title}</h3>
                        <p class="book-author" style="margin-bottom: 0.5rem;">${book.author}</p>
                        <p class="book-description" style="font-size: 0.9rem; color: #666; margin-bottom: 1rem;">${book.description || 'Sin descripción disponible.'}</p>
                        <div class="book-actions" style="display: flex; flex-direction: column; gap: 0.5rem;">
                            <button class="read-book-btn" onclick="openBookViewer('${book.id}')">
                              ${readBtnText}
                            </button>
                            ${downloadBtn}
                        </div>
                    </div>
                </div>
            </div>
          `}).join('');

        // Add Click events for mobile interaction
        document.querySelectorAll('.book-list-item').forEach(item => {
            item.addEventListener('click', function (e) {
                // If clicking a button inside, do nothing special (handled by button onclick)
                if (e.target.tagName === 'BUTTON') return;

                // Toggle active class on this item
                const wasActive = this.classList.contains('active');

                // Close all others
                document.querySelectorAll('.book-list-item.active').forEach(activeItem => {
                    activeItem.classList.remove('active');
                });

                if (!wasActive) {
                    this.classList.add('active');
                }
            });
        });

    } catch (err) {
        console.error('Error loading library:', err);
        booksGrid.innerHTML = '<p class="error-msg">Error al cargar la biblioteca. Por favor recarga la página.</p>';
    }
}

// Open PDF viewer modal
// Open PDF viewer modal
async function openBookViewer(bookId) {
    // We need to get the book details. 
    // Since we just rendered them, we could grab from DOM or fetch again. 
    // For simplicity/reliability, we can fetch single or find in previously fetched list if we stored it.
    // But since `loadLibraryBooks` doesn't store globally, let's fetch single for robustness 
    // OR just use the title from the DOM if we want to be fast.
    // BETTER: Let's fetch the single metadata record to be sure.

    try {
        const { data: book, error } = await supabaseClient
            .from('books')
            .select('*')
            .eq('id', bookId)
            .single();

        if (error || !book) throw new Error('Libro no encontrado');

        currentBook = book;
        currentPage = 1;

        // Show modal
        const overlay = document.getElementById('pdfViewerOverlay');
        const modal = document.getElementById('pdfViewerModal');
        const bookTitle = document.getElementById('pdfBookTitle');

        bookTitle.textContent = `${book.title} - ${book.author}`;
        overlay.classList.add('open');
        modal.classList.add('open');

        // Load PDF securely via Edge Function
        await loadPDF(bookId);

    } catch (err) {
        console.error("Error opening book:", err);
        alert("Error al abrir el libro.");
    }
}

// Load PDF from Supabase Edge Function (secure proxy)
async function loadPDF(bookId) {
    try {
        const loadingMsg = document.getElementById('pageInfo');
        loadingMsg.textContent = 'Cargando libro...';

        // Call secure Edge Function - client never sees Google Drive URL
        const response = await fetch(
            `${SUPABASE_URL}/functions/v1/get-book-preview?id=${bookId}`,
            {
                headers: {
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            }
        );

        if (!response.ok) {
            let errorMessage = `Error ${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData.error) {
                    errorMessage = errorData.error;
                }
            } catch (e) {
                // Could not parse JSON, use default status
            }
            throw new Error(errorMessage);
        }

        // Get max pages from response header
        const maxPages = parseInt(response.headers.get('X-Max-Pages') || '15');
        LIBRARY_CONFIG.maxPages = maxPages;

        const pdfData = await response.arrayBuffer();

        // Load PDF with PDF.js
        const loadingTask = pdfjsLib.getDocument({ data: pdfData });
        pdfDoc = await loadingTask.promise;

        console.log(`📚 PDF loaded: ${pdfDoc.numPages} total pages, showing max ${maxPages}`);

        // Render first page
        renderPage(1);

    } catch (error) {
        console.error('Error loading PDF:', error);
        document.getElementById('pageInfo').textContent = '❌ Error al cargar el libro';
        alert(`No se pudo cargar el libro: ${error.message}`);
    }
}

// Render a specific page
async function renderPage(num) {
    pageRendering = true;

    try {
        const page = await pdfDoc.getPage(num);
        const canvas = document.getElementById('pdfCanvas');
        const ctx = canvas.getContext('2d');

        // Calculate scale to fit container
        const container = canvas.parentElement;
        const containerWidth = container.clientWidth - 40; // padding
        const viewport = page.getViewport({ scale: 1 });
        const scale = containerWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        canvas.height = scaledViewport.height;
        canvas.width = scaledViewport.width;

        const renderContext = {
            canvasContext: ctx,
            viewport: scaledViewport
        };

        await page.render(renderContext).promise;

        pageRendering = false;

        if (pageNumPending !== null) {
            renderPage(pageNumPending);
            pageNumPending = null;
        }

        // Update page info
        const totalPages = Math.min(pdfDoc.numPages, LIBRARY_CONFIG.maxPages);
        document.getElementById('pageInfo').textContent = `Página ${num} de ${totalPages}`;

        // Update button states
        document.getElementById('prevPage').disabled = (num <= 1);
        document.getElementById('nextPage').disabled = (num >= totalPages);

    } catch (error) {
        console.error('Error rendering page:', error);
    }
}

// Queue page rendering
function queueRenderPage(num) {
    if (pageRendering) {
        pageNumPending = num;
    } else {
        renderPage(num);
    }
}

// Navigate to previous page
function onPrevPage() {
    if (currentPage <= 1) return;
    currentPage--;
    queueRenderPage(currentPage);
}

// Navigate to next page
function onNextPage() {
    const maxPages = Math.min(pdfDoc.numPages, LIBRARY_CONFIG.maxPages);

    if (currentPage >= maxPages) {
        alert(`Has alcanzado el límite de la vista previa (${LIBRARY_CONFIG.maxPages} páginas). Para leer el libro completo, por favor adquiérelo.`);
        return;
    }

    currentPage++;
    queueRenderPage(currentPage);
}

// Close PDF viewer
function closePDFViewer() {
    const overlay = document.getElementById('pdfViewerOverlay');
    const modal = document.getElementById('pdfViewerModal');

    overlay.classList.remove('open');
    modal.classList.remove('open');

    // Clean up
    currentBook = null;
    currentPage = 1;
    pdfDoc = null;
}

// Download full book (for validated users)
async function downloadBook(bookId, title) {
    try {
        if (window.showNotification) {
            showNotification(`Iniciando descarga de "${title}"...`, '📥');
        } else {
            console.log('Descargando...');
        }

        const response = await fetch(
            `${SUPABASE_URL}/functions/v1/get-book-preview?id=${bookId}`,
            {
                headers: {
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            }
        );

        if (!response.ok) throw new Error('Error al descargar');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `${title}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);

        if (window.showNotification) {
            showNotification('Descarga completada con éxito', '✅');
        }
    } catch (err) {
        console.error(err);
        alert('Error al procesar la descarga. Por favor contacta a un moderador.');
    }
}

window.downloadBook = downloadBook;

// Initialize library when content is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Load books directly (Supabase)
    loadLibraryBooks();

    // Setup event listeners
    document.getElementById('closePdfBtn')?.addEventListener('click', closePDFViewer);
    document.getElementById('pdfViewerOverlay')?.addEventListener('click', closePDFViewer);
    document.getElementById('prevPage')?.addEventListener('click', onPrevPage);
    document.getElementById('nextPage')?.addEventListener('click', onNextPage);

    // Prevent modal from closing when clicking inside
    document.getElementById('pdfViewerModal')?.addEventListener('click', (e) => {
        e.stopPropagation();
    });
});

// Expose globally for Auth update
window.loadLibraryBooks = loadLibraryBooks;

// Listen for Auth Validation
window.addEventListener('auth:validated', (e) => {
    console.log("Auth validated event received:", e.detail);
    loadLibraryBooks();
});
