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
async function loadLibraryBooks() {
    const booksGrid = document.getElementById('booksGrid');
    if (!booksGrid || !CONTENT.library) return;

    const books = CONTENT.library.books || [];

    if (books.length === 0) {
        booksGrid.innerHTML = '<p class="no-books">No hay libros disponibles en este momento.</p>';
        return;
    }

    booksGrid.innerHTML = books.map(book => `
    <div class="book-card" data-book-id="${book.id}">
      <div class="book-cover">
        <img src="${book.cover}" alt="${book.title}" onerror="this.src='LOGOV4.png'">
      </div>
      <div class="book-info">
        <h3 class="book-title">${book.title}</h3>
        <p class="book-author">${book.author}</p>
        <p class="book-description">${book.description}</p>
        <button class="read-book-btn" onclick="openBookViewer('${book.id}')">
          📖 Leer Primeras ${LIBRARY_CONFIG.maxPages} Páginas
        </button>
      </div>
    </div>
  `).join('');
}

// Open PDF viewer modal
async function openBookViewer(bookId) {
    const book = CONTENT.library.books.find(b => b.id === bookId);
    if (!book) return;

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
            throw new Error(`Error al cargar el libro: ${response.status}`);
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
        alert('No se pudo cargar el libro. Por favor intenta más tarde.');
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

// Initialize library when content is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Wait for content to be loaded
    const checkContentLoaded = setInterval(() => {
        if (CONTENT && CONTENT.library) {
            clearInterval(checkContentLoaded);
            loadLibraryBooks();
        }
    }, 100);

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
